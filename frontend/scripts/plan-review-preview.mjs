// Own a production bundle so another workspace build cannot replace files mid-test.
import {build,preview} from "vite";
import {copyFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const bundle=process.env.USER_PLAN_PREVIEW_BUNDLE??"plan-review-dist";
if(!/^[a-z0-9-]+$/.test(bundle))throw new Error("Invalid review bundle name");
const tempRoot=fileURLToPath(new URL("../../.tmp/",import.meta.url));
const outDir=path.resolve(tempRoot,bundle);
if(path.dirname(outDir)!==path.resolve(tempRoot))throw new Error("Review bundle must stay in workspace .tmp");
const port=Number(process.env.USER_PLAN_PREVIEW_PORT??55441);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Invalid review port");
await build({root,build:{outDir,emptyOutDir:true}});
// Private routes use the same app.html rewrite as the deployed application.
await copyFile(path.join(outDir,"index.html"),path.join(outDir,"app.html"));
const server=await preview({root,build:{outDir},preview:{host:"127.0.0.1",port,strictPort:true}});
process.stdout.write(`Plan review production preview ready on loopback:${port}\n`);
const stop=()=>{server.httpServer.closeAllConnections?.();server.httpServer.close(()=>process.exit(0));};
process.on("SIGTERM",stop);process.on("SIGINT",stop);
