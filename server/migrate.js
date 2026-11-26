import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('Connecting to Neon PostgreSQL...');
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, 'migrations', '001_init_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing 20-table schema migrations on Neon...');
    await client.query(sql);
    console.log('Successfully applied all 20 tables, indexes, and seed NBFC rules on Neon PostgreSQL!');
    
    // Check tables created
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('\nVerified tables created in Neon database:');
    res.rows.forEach((r, idx) => console.log(`${idx + 1}. ${r.table_name}`));

    // Check seed rules
    const rules = await client.query('SELECT nbfc_code, nbfc_name, min_cibil_score FROM nbfc_rules;');
    console.log('\nSeed NBFC rules in Neon:');
    rules.rows.forEach(r => console.log(`- ${r.nbfc_name} (${r.nbfc_code}): Min CIBIL ${r.min_cibil_score}`));

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
