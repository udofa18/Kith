const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/border-black\/10 dark:border-white\/10/g, 'border-foreground/10');
  content = content.replace(/bg-black\/5 dark:bg-white\/5/g, 'bg-foreground/5');
  content = content.replace(/bg-black\/10 dark:bg-white\/10/g, 'bg-foreground/10');
  content = content.replace(/border-black\/5 dark:border-white\/5/g, 'border-foreground/5');
  content = content.replace(/border-black\/20 dark:border-white\/20/g, 'border-foreground/20');
  content = content.replace(/hover:bg-black\/5 dark:hover:bg-white\/5/g, 'hover:bg-foreground/5');
  content = content.replace(/hover:bg-black\/10 dark:hover:bg-white\/10/g, 'hover:bg-foreground/10');
  content = content.replace(/focus-within:bg-black\/5 dark:focus-within:bg-white\/\[0\.07\]/g, 'focus-within:bg-foreground/5');
  fs.writeFileSync(file, content);
}

fixFile('src/pages/ChallengeDetails.tsx');
fixFile('src/pages/ChallengeSubmissions.tsx');
fixFile('src/pages/Challenges.tsx');
