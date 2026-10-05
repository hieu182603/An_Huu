// Explicit operator smoke check: synthetic data only; no DB, no customer records.
require('dotenv').config();require('ts-node/register');
const {loadEnv}=require('../src/config/env');
const {createExplanationProvider,GeminiProviderError}=require('../src/modules/ai/gemini');
(async()=>{
 const config=loadEnv(),provider=createExplanationProvider(config);
 if(!provider)throw new GeminiProviderError('GEMINI_NOT_CONFIGURED');
 const result=await provider.select({question:'Explain the sample balance.',facts:[{key:'sample',text:'Synthetic sample: the balance is 100 VND.'}],knowledge:[]},AbortSignal.timeout(config.GEMINI_TIMEOUT_MS));
 if(result.factKeys.length!==1||result.factKeys[0]!=='sample'||result.citationIds.length)throw new GeminiProviderError('GEMINI_SMOKE_SELECTION_INVALID');
 console.log(JSON.stringify({provider:provider.name,mode:config.GEMINI_API_MODE,model:config.GEMINI_MODEL,verified:true,syntheticDataOnly:true}));
})().catch(e=>{console.error(JSON.stringify({verified:false,code:e instanceof GeminiProviderError?e.code:'CONFIG_OR_RUNTIME_ERROR',status:e instanceof GeminiProviderError?e.status:undefined}));process.exitCode=1;});
