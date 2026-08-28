import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pkg from "libpg-query";
const { parse } = pkg;

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

let hadError = false;

for (const file of files) {
  const sql = await readFile(path.join(dir, file), "utf8");
  try {
    const result = await parse(sql);
    console.log(`OK   ${file} (${result.stmts.length} statements)`);
  } catch (err) {
    hadError = true;
    console.error(`FAIL ${file}`);
    console.error(err.message ?? err);
  }
}

process.exit(hadError ? 1 : 0);
