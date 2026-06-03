const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env variables.");
  process.exit(1);
}

async function run() {
  console.log("Database Keep-Alive Job Started.");
  console.log("Supabase URL:", supabaseUrl);

  try {
    // 1. Insert a log row into public.keep_alive using default values
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/keep_alive`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({})
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Failed to insert keep_alive record: ${insertRes.status} - ${errText}`);
    }

    const insertedData = await insertRes.json();
    console.log("SUCCESS: Inserted keep_alive record:", insertedData);

    // 2. Delete logs older than 7 days
    const thresholdDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    console.log(`Cleaning up keep_alive records older than: ${thresholdDate}`);

    const deleteRes = await fetch(`${supabaseUrl}/rest/v1/keep_alive?touched_at=lt.${encodeURIComponent(thresholdDate)}`, {
      method: "DELETE",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      }
    });

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      throw new Error(`Failed to cleanup old keep_alive records: ${deleteRes.status} - ${errText}`);
    }

    console.log("SUCCESS: Database cleanup completed successfully!");
  } catch (error) {
    console.error("CRITICAL ERROR during keep-alive execution:", error);
    process.exit(1);
  }
}

run();
