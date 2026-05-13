const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '../terraform/terraform.tfstate');
const envFile = path.join(__dirname, '../.env');

try {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const pass = state.outputs.database_password.value;
  const urlBase = state.outputs.database_connection_url.value;
  const authSecret = state.outputs.better_auth_secret.value;

  // URL encode the password as it contains special characters
  const encodedPass = encodeURIComponent(pass);
  const encodedUrl = urlBase.replace(":" + pass + "@", ":" + encodedPass + "@");

  let envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

  // Replace DATABASE_URL if exists, or append
  if (envContent.includes('DATABASE_URL=')) {
    // Regex to match DATABASE_URL="..." avoiding capturing new lines
    envContent = envContent.replace(/DATABASE_URL=".*?"/g, `DATABASE_URL="${encodedUrl}"`);
    if (!envContent.includes(encodedUrl)) {
        envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL="${encodedUrl}"`);
    }
  } else {
    envContent += `\nDATABASE_URL="${encodedUrl}"`;
  }

  // Ensure other required env vars exist
  if (!envContent.includes('BETTER_AUTH_SECRET=')) {
    envContent += `\nBETTER_AUTH_SECRET="${authSecret}"`;
  }
  if (!envContent.includes('BETTER_AUTH_URL=')) {
    envContent += `\nBETTER_AUTH_URL="http://localhost:3000"`;
  }
  if (!envContent.includes('NEXT_PUBLIC_APP_URL=')) {
    envContent += `\nNEXT_PUBLIC_APP_URL="http://localhost:3000"`;
  }

  fs.writeFileSync(envFile, envContent);
  console.log('✅ Berhasil restore .env dengan credentials GCP Cloud SQL!');
  console.log('✅ URL Password sudah di URL-encode agar aman dengan Prisma.');
} catch (e) {
  console.error('Error:', e.message);
}
