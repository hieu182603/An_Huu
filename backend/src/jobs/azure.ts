import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient, type ServiceBusReceiver, type ServiceBusSender } from "@azure/service-bus";
import { z } from "zod";
import { log } from "../common/logger";

const messageSchema = z.object({ eventId: z.string().uuid() }).strict();
export class AzureEventQueue {
  private client: ServiceBusClient;
  private sender: ServiceBusSender;
  private receiver: ServiceBusReceiver;
  constructor(namespace: string, queue: string) {
    this.client = new ServiceBusClient(namespace, new DefaultAzureCredential(), { retryOptions: { maxRetries: 3, timeoutInMs: 15000 } });
    this.sender = this.client.createSender(queue);
    this.receiver = this.client.createReceiver(queue, { receiveMode: "peekLock", maxAutoLockRenewalDurationInMs: 120000 });
  }
  async publish(eventId: string) {
    // Queue contains identifiers only. The database is the durable source of truth.
    await this.sender.sendMessages({ body: { eventId }, contentType: "application/json" });
  }
  subscribe(process: (id: string) => Promise<void>) {
    return this.receiver.subscribe({
      processMessage: async message => {
        const parsed = messageSchema.safeParse(message.body);
        if (!parsed.success) {
          await this.receiver.deadLetterMessage(message, { deadLetterReason: "INVALID_EVENT", deadLetterErrorDescription: "Expected an event identifier." });
          return;
        }
        await process(parsed.data.eventId);
        await this.receiver.completeMessage(message);
      },
      processError: async () => { log("error", "worker.error", { code: "QUEUE_DELIVERY_FAILED" }); },
    }, { autoCompleteMessages: false, maxConcurrentCalls: 4 });
  }
  async close() { await this.receiver.close(); await this.sender.close(); await this.client.close(); }
}
