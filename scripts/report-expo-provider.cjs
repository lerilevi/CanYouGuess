const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// This hook runs after Xcode compiles ExpoModulesProvider.swift, including on
// failed builds. Its output stays in EAS build logs; it does not ship in the app.
const root = process.env.EXPO_PROVIDER_DIAGNOSTIC_ROOT ||
  path.join(process.cwd(), 'ios', 'Pods', 'Target Support Files');
const candidates = [];
function visit(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.name === 'ExpoModulesProvider.swift') candidates.push(fullPath);
  }
}

try {
  visit(root);
  console.log(`[provider-diagnostic] EAS status=${process.env.EAS_BUILD_STATUS || 'unknown'}; generated files=${candidates.length}`);
  for (const file of candidates) {
    const source = fs.readFileSync(file, 'utf8');
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    const match = source.match(/func getModuleClasses\(\) -> \[AnyModule\.Type\] \{([\s\S]*?)\n  \}/);
    const classes = match ? [...match[1].matchAll(/\b([A-Za-z_][\w.]*)\.self\b/g)].map((item) => item[1]) : [];
    console.log(`[provider-diagnostic] file=${path.relative(process.cwd(), file)} sha256=${hash}`);
    console.log(`[provider-diagnostic] classCount=${classes.length}; classes=${classes.join(', ') || '(none parsed)'}`);
    console.log(`[provider-diagnostic] ExpoLinkingModule in generated source=${source.includes('ExpoLinkingModule.self')}`);
    if (!match) console.log('[provider-diagnostic] WARNING: getModuleClasses block not parsed');
  }
  if (candidates.length === 0) console.log(`[provider-diagnostic] WARNING: no provider file under ${root}`);
} catch (error) {
  // Do not fail a finished native build solely because its diagnostic hook failed.
  console.log(`[provider-diagnostic] inspection failed: ${String(error)}`);
}
