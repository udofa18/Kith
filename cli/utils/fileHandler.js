import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { tmpdir } from 'os';

export async function downloadAndExtract(repoUrl, targetDir, subPath = '') {
  const zipUrl = `${repoUrl}/archive/refs/heads/main.zip`;
  const tempDir = path.join(tmpdir(), `fm-${Date.now()}`);
  const zipPath = path.join(tempDir, 'repo.zip');

  await fs.ensureDir(tempDir);

  // Download ZIP
  const response = await axios({
    method: 'get',
    url: zipUrl,
    responseType: 'stream',
  });

  const writer = fs.createWriteStream(zipPath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  // Extract
  const zip = new AdmZip(zipPath);
  const extractPath = path.join(tempDir, 'extracted');
  zip.extractAllTo(extractPath, true);

  // Find the root folder in ZIP (usually repo-name-main)
  const rootFolders = await fs.readdir(extractPath);
  const repoRoot = path.join(extractPath, rootFolders[0]);
  const sourcePath = path.join(repoRoot, subPath);

  // Copy to target
  await fs.ensureDir(targetDir);
  await fs.copy(sourcePath, targetDir);

  // Cleanup
  await fs.remove(tempDir);
}

export async function detectPackageManager() {
  if (await fs.pathExists('yarn.lock')) return 'yarn';
  if (await fs.pathExists('pnpm-lock.yaml')) return 'pnpm';
  return 'npm';
}

export async function detectProjectType() {
  const pkg = await fs.readJson('package.json').catch(() => ({}));
  if (pkg.dependencies?.next) return 'Next.js';
  if (pkg.dependencies?.react) return 'React';
  return 'Unknown';
}
