import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
let checked = 0;
function scan(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const file=join(directory,entry.name);
    if(entry.isDirectory()) scan(file);
    else if (/\.(js|json|map)$/.test(file)) {
      const content=readFileSync(file,'utf8'); checked++;
      assert.ok(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(content), 'Secret API key found in browser asset (value suppressed)');
      assert.ok(!content.includes('SUPABASE_SECRET_KEY'), 'Server credential reference reached browser bundle');
      for(const match of content.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
        let payload;
        try { payload=JSON.parse(Buffer.from(match[1],'base64url').toString()); } catch { continue; }
        assert.notEqual(payload.role,'service_role','Privileged JWT found in browser asset (value suppressed)');
      }
    }
  }
}
scan('.next/static');
assert.ok(checked>0,'No compiled browser assets found');
console.log(JSON.stringify({suite:'browser_bundle_secrets',assetsChecked:checked,privilegedCredentialsFound:false}));
