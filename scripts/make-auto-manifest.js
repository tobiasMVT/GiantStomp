// scripts/make-auto-manifest.js
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const TICKETS_ROOT = path.join(PROJECT_ROOT, "public", "tickets");

console.log("PROJECT_ROOT:", PROJECT_ROOT);
console.log("TICKETS_ROOT:", TICKETS_ROOT);

if (!fs.existsSync(TICKETS_ROOT)) {
  console.error("❌ Folder not found:", TICKETS_ROOT);
  process.exit(1);
}

// Loop through each bucket folder (e.g., bonusUnderWin100)
for (const bucketFolder of fs.readdirSync(TICKETS_ROOT, { withFileTypes: true })) {
  if (!bucketFolder.isDirectory()) continue;

  const bucketName = bucketFolder.name;
  const bucketPath = path.join(TICKETS_ROOT, bucketName);
  const files = fs.readdirSync(bucketPath).filter(f => f !== 'manifest.json' && f.toLowerCase().endsWith(".json"));

  if (!files.length) {
    console.warn(`⚠️ No JSON files in ${bucketName}`);
    continue;
  }

  // Parse weight from filename pattern like "10_bonusUnderWin100_1.json"
  const manifest = files.map(file => {

      const m = file.match(/^(\d+)_/);
      const weight = m ? parseInt(m[1], 10) : 1; // default 1 if no number
      return { file, weight };
  
  });

  const outPath = path.join(TICKETS_ROOT, bucketName, "manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest), "utf8");
  console.log(`✅ Wrote ${outPath} (${manifest.length} files)`);
}

console.log("🎉 Done generating manifests.");