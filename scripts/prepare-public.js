const fs = require("node:fs");
const path = require("node:path");

const rootDirectory = path.join(__dirname, "..");
const publicDirectory = path.join(rootDirectory, "public");
const frontendDirectory = path.join(rootDirectory, "frontend");
const imageDirectory = path.join(rootDirectory, "images");

fs.mkdirSync(publicDirectory, { recursive: true });

for (const fileName of fs.readdirSync(frontendDirectory)) {
  const source = path.join(frontendDirectory, fileName);
  const destination = path.join(publicDirectory, fileName);
  if (fs.statSync(source).isFile()) {
    fs.copyFileSync(source, destination);
  }
}

fs.cpSync(imageDirectory, path.join(publicDirectory, "images"), {
  recursive: true
});
