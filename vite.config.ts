import { defineConfig, loadEnv } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { publicAccessConfig } from './src/access-protocol.mjs';
export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'SUPABASE_');
  const fromFile=JSON.parse(readFileSync('public/access-config.json','utf8'));
  const config=publicAccessConfig(env.SUPABASE_URL||env.SUPABASE_PUBLISHABLE_KEY?{url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY}:fromFile);
  if((env.SUPABASE_URL||env.SUPABASE_PUBLISHABLE_KEY)&&!config)throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntos.');
  const json=JSON.stringify(config||{url:'',publishableKey:''})+'\n';
  return {
    base:'./',
    plugins:[{
      name:'public-access-config',
      transformIndexHtml:html=>config?html.replace('https://*.supabase.co;',`${config.url};`):html,
      configureServer(server){server.middlewares.use('/access-config.json',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(json);});},
      writeBundle(){writeFileSync('dist/access-config.json',json);},
    }],
    worker:{format:'es'},
    optimizeDeps:{exclude:['@ffmpeg/ffmpeg'],include:['@huggingface/transformers']},
    build:{target:'es2022'},
  };
});
