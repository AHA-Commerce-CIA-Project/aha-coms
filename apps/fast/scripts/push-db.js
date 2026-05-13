const fs = require('fs');
const { execSync } = require('child_process');

try {
  const state = JSON.parse(fs.readFileSync('./terraform/terraform.tfstate', 'utf8'));
  const pass = state.outputs.database_password.value;
  const urlBase = state.outputs.database_connection_url.value;
  
  // Replace the literal pass in urlBase with encoded pass for Prisma
  const encodedPass = encodeURIComponent(pass);
  const encodedUrl = urlBase.replace(":" + pass + "@", ":" + encodedPass + "@");
  
  console.log("Running prisma db push with encoded password...");
  execSync('npx prisma db push --accept-data-loss', { 
    env: { ...process.env, DATABASE_URL: encodedUrl },
    stdio: 'inherit'
  });
  console.log("Prisma db push completed!");
} catch(e) {
  console.error("Error during execution:", e.message);
}
