// Validate generation while a Windows dev server holds the default Prisma DLL.
// Do not stop that server or replace its loaded engine. This is not the normal build command.
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const folder=path.resolve('.cache/t12-prisma-build'),source=fs.readFileSync('prisma/schema.prisma','utf8');
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'schema.prisma'),source.replace('provider        = "prisma-client-js"','provider        = "prisma-client-js"\n  output          = "./client"'));
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'generate','--schema',path.join(folder,'schema.prisma')],{encoding:'utf8',timeout:60000,env:process.env});
if(result.status!==0){console.error('ISOLATED_PRISMA_GENERATION_FAILED');process.exitCode=1;}
else{console.log('ISOLATED_PRISMA_GENERATION_PASS');const compiled=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc')],{stdio:'inherit',timeout:60000});process.exitCode=compiled.status??1;if(compiled.status===0)console.log('TYPESCRIPT_EMIT_PASS');}
