const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const dotenv = require('../backend/node_modules/dotenv');
const configPath = path.join(root, 'backend/.env');
if (!fs.existsSync(configPath)) {
  console.error('Thiếu backend/.env. Hãy cấu hình theo backend/.env.example trước khi chạy ứng dụng.');
  process.exit(1);
}
const config = { ...dotenv.parse(fs.readFileSync(configPath)), ...process.env };
if (!config.OUTBOX_ENCRYPTION_KEY && config.NODE_ENV !== 'production') {
  config.OUTBOX_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('hex');
  fs.appendFileSync(configPath, '\nOUTBOX_ENCRYPTION_KEY=' + config.OUTBOX_ENCRYPTION_KEY + '\n');
}
const services = [];
let stopping = false;
function start(name, cwd, args, watch = false) {
  const service = { child: null, timer: null, watcher: null, failures: 0, restartRequested: false };
  services.push(service);
  function launch() {
    if (stopping) return;
    service.restartRequested = false;
    const started = Date.now();
    console.log(`[${name}] Đang khởi động…`);
    const child = spawn(process.execPath, args, { cwd: path.join(root, cwd), stdio: 'inherit', windowsHide: true });
    service.child = child;
    let handled = false;
    const ended = () => {
      if (handled) return;
      handled = true; service.child = null;
      if (stopping) return;
      if (service.restartRequested) { service.timer = setTimeout(launch, 250); return; }
      if (Date.now() - started > 60000) service.failures = 0;
      service.failures += 1;
      if (service.failures > 3) {
        console.error(`[${name}] Đã dừng sau 3 lần thử lại. Xem lỗi phía trên; sửa tệp nguồn để chạy lại. Các dịch vụ khác vẫn chạy.`);
        return;
      }
      const delay = service.failures * 2000;
      console.error(`[${name}] Tiến trình đã dừng. Thử khởi động lại sau ${delay / 1000} giây.`);
      service.timer = setTimeout(launch, delay);
    };
    child.once('error', ended);
    child.once('exit', ended);
  }
  if (watch) {
    let debounce;
    service.watcher = fs.watch(path.join(root, cwd, 'src'), { recursive: true }, (_event, filename) => {
      if (!filename || !/\.(ts|json)$/.test(filename) || /[/\\]tests[/\\]/.test(filename)) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (stopping) return;
        clearTimeout(service.timer); service.failures = 0; service.restartRequested = true;
        if (service.child) service.child.kill('SIGTERM'); else launch();
      }, 600);
    });
  }
  launch();
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const service of services) {
    clearTimeout(service.timer); service.watcher?.close(); service.child?.kill('SIGTERM');
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start('API', 'backend', ['node_modules/ts-node/dist/bin.js', 'src/server.ts'], true);
start('Web', 'frontend', ['node_modules/vite/bin/vite.js']);
if (config.OUTBOX_ENCRYPTION_KEY && config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS)
  start('Email', 'backend', ['node_modules/ts-node/dist/bin.js', 'src/worker.ts'], true);
else console.log('Email worker chưa chạy: điền SMTP_HOST, SMTP_USER, SMTP_PASS và OUTBOX_ENCRYPTION_KEY trong backend/.env rồi chạy lại npm run dev.');
