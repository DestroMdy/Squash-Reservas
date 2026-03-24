import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const defaultBackupRoot = path.join(os.homedir(), "Desktop", "Backups Squash Reservas");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = process.argv[2] || defaultBackupRoot;
const backupDir = path.join(backupRoot, `backup-${timestamp}`);

const IMPORTANT_TABLES = [
  "profiles",
  "courts",
  "time_slots",
  "bookings",
  "external_tournaments",
  "admin_audit_logs",
  "private_messages",
  "private_message_groups",
  "private_message_group_members",
  "private_group_messages",
  "casual_matches",
  "match_availability_requests"
];

const IMPORTANT_KV_KEYS = [
  "sr:beginner-rules:ack",
  "sr:booking-waitlists",
  "sr:casual-match:states",
  "sr:live-center:config",
  "sr:live-center:scoreboards",
  "sr:live-center:squore-tokens",
  "sr:live-center:ingest-status",
  "sr:live-stream:config",
  "sr:live-stream:scoreboard",
  "sr:live-stream:squore-token"
];

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  }).trim();
}

async function fetchAllRows(baseUrl, serviceRoleKey, tableName) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const response = await fetch(`${baseUrl}/rest/v1/${tableName}?select=*`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Range-Unit": "items",
        Range: `${from}-${from + pageSize - 1}`
      },
      cache: "no-store"
    });

    const text = await response.text();
    const payload = text.trim() ? JSON.parse(text) : [];

    if (!response.ok) {
      throw new Error(
        typeof payload === "object" && payload?.message
          ? payload.message
          : `Error ${response.status} al exportar ${tableName}`
      );
    }

    if (!Array.isArray(payload)) {
      throw new Error(`Respuesta inesperada al exportar ${tableName}`);
    }

    rows.push(...payload);

    if (payload.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function getKvValue(kvUrl, kvToken, key) {
  const encodedKey = encodeURIComponent(key);
  const response = await fetch(`${kvUrl}/get/${encodedKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`
    },
    cache: "no-store"
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Error ${response.status} al leer KV ${key}`);
  }

  return payload?.result ?? null;
}

function sanitizeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "_");
}

function extractAvatarRelativePath(avatarUrl) {
  try {
    const url = new URL(avatarUrl);
    const marker = "/storage/v1/object/public/avatars/";
    const index = url.pathname.indexOf(marker);

    if (index === -1) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Error ${response.status} al descargar ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  ensureDir(path.dirname(destination));
  fs.writeFileSync(destination, Buffer.from(arrayBuffer));
}

async function main() {
  const mergedEnv = {
    ...parseEnvFile(path.join(repoRoot, ".env.local")),
    ...parseEnvFile(path.join(repoRoot, ".vercel", ".env.production.local")),
    ...process.env
  };

  const supabaseUrl = mergedEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = mergedEnv.SUPABASE_SERVICE_ROLE_KEY;
  const kvUrl = mergedEnv.KV_REST_API_URL;
  const kvToken = mergedEnv.KV_REST_API_TOKEN;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el backup.");
  }

  ensureDir(backupDir);
  const codeDir = path.join(backupDir, "code");
  const dataDir = path.join(backupDir, "data");
  const kvDir = path.join(backupDir, "kv");
  const storageDir = path.join(backupDir, "storage", "avatars");
  const metaDir = path.join(backupDir, "meta");

  [codeDir, dataDir, kvDir, storageDir, metaDir].forEach(ensureDir);

  const gitMeta = {
    branch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: runGit(["rev-parse", "HEAD"]),
    latestCommit: runGit(["log", "-1", "--oneline"]),
    remotes: runGit(["remote", "-v"]),
    status: runGit(["status", "--short"])
  };

  execFileSync(
    "git",
    ["archive", "--format=zip", "--output", path.join(codeDir, "repo-head.zip"), "HEAD"],
    { cwd: repoRoot, stdio: "ignore" }
  );

  writeJson(path.join(metaDir, "git.json"), gitMeta);
  writeJson(path.join(metaDir, "environment.production.keys.json"), {
    generated_at: new Date().toISOString(),
    source: "Vercel production env + local env",
    keys: Object.keys(mergedEnv)
      .filter((key) => /^[A-Z0-9_]+$/.test(key))
      .sort()
  });

  const tableSummary = [];
  let profilesRows = [];

  for (const tableName of IMPORTANT_TABLES) {
    try {
      const rows = await fetchAllRows(supabaseUrl, serviceRoleKey, tableName);
      writeJson(path.join(dataDir, `${tableName}.json`), rows);
      tableSummary.push({ table: tableName, rows: rows.length, ok: true });

      if (tableName === "profiles") {
        profilesRows = rows;
      }
    } catch (error) {
      tableSummary.push({
        table: tableName,
        rows: null,
        ok: false,
        error: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  }

  writeJson(path.join(metaDir, "tables.json"), tableSummary);

  const kvSummary = [];
  if (kvUrl && kvToken) {
    for (const key of IMPORTANT_KV_KEYS) {
      try {
        const value = await getKvValue(kvUrl, kvToken, key);
        const targetFile = path.join(kvDir, `${sanitizeFileName(key)}.json`);
        writeJson(targetFile, { key, value });
        kvSummary.push({ key, ok: true, file: path.basename(targetFile) });
      } catch (error) {
        kvSummary.push({
          key,
          ok: false,
          error: error instanceof Error ? error.message : "Error desconocido"
        });
      }
    }
  } else {
    kvSummary.push({
      ok: false,
      key: "*",
      error: "KV_REST_API_URL o KV_REST_API_TOKEN no disponibles"
    });
  }

  writeJson(path.join(metaDir, "kv.json"), kvSummary);

  const avatarsSummary = [];
  const avatarUrls = Array.from(
    new Set(
      profilesRows
        .map((profile) => profile?.avatar_url)
        .filter((value) => typeof value === "string" && value.trim())
    )
  );

  for (const avatarUrl of avatarUrls) {
    const relativePath = extractAvatarRelativePath(avatarUrl);
    const destination = relativePath
      ? path.join(storageDir, relativePath)
      : path.join(storageDir, sanitizeFileName(path.basename(new URL(avatarUrl).pathname)));

    try {
      await downloadFile(avatarUrl, destination);
      avatarsSummary.push({
        url: avatarUrl,
        ok: true,
        file: path.relative(backupDir, destination)
      });
    } catch (error) {
      avatarsSummary.push({
        url: avatarUrl,
        ok: false,
        error: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  }

  writeJson(path.join(metaDir, "avatars.json"), avatarsSummary);
  fs.writeFileSync(
    path.join(metaDir, "README.txt"),
    [
      `Backup generado: ${new Date().toISOString()}`,
      `Proyecto: squashreservas`,
      `Repo: ${gitMeta.commit}`,
      "",
      "Contenido:",
      "- code/repo-head.zip: snapshot del codigo versionado",
      "- data/*.json: export logico de tablas Supabase",
      "- kv/*.json: estados operativos guardados en KV",
      "- storage/avatars: copia de fotos de perfil activas",
      "- meta/*: manifiestos de control"
    ].join("\n"),
    "utf8"
  );

  console.log(`Backup creado en: ${backupDir}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo generar el backup."
  );
  process.exitCode = 1;
});
