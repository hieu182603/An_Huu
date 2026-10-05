// Serves built UI on an OS-assigned port. API calls must be intercepted by tests.
// No Vite plugin, port eviction or taskkill. Only this process owns the server.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../frontend/dist'),frontend=path.resolve(__dirname,'../../frontend');
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('BUILD_FRONTEND_FIRST');
const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api')){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{code:'UNMOCKED_TEST_API',message:'Browser fixture missing'}}));}
 let relative;try{relative=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
 let file=path.resolve(root,'.'+relative);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(500);return res.end();}res.setHeader('Content-Length',data.length);res.end(data);});
});
server.listen(0,'127.0.0.1',()=>{const baseURL='http://127.0.0.1:'+server.address().port;const child=spawn(process.execPath,[path.join(frontend,'node_modules/@playwright/test/cli.js'),'test','--config',path.join(__dirname,'playwright-acceptance.config.cjs')],{cwd:frontend,env:{...process.env,T12_BROWSER_URL:baseURL},stdio:'inherit'});
 child.on('error',()=>{process.exitCode=1;server.closeAllConnections();server.close();});child.on('exit',code=>{process.exitCode=code??1;server.closeAllConnections();server.close();});});
