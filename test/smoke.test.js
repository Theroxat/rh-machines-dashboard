import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

// Le serveur attendait la fin du balayage de l'encre — vingt-cinq secondes sur
// dix mille machines — avant d'écouter. Pendant ce temps le tunnel rendait un
// refus de connexion : une page d'erreur du navigateur, alors que le service
// allait très bien et travaillait. La route rend déjà 503 tant qu'elle n'a
// rien, et la page sait le dire.
test("the server listens before it warms up, so a cold start is not a dead site", () => {
  const listen = server.indexOf("server.listen(");
  const firstRead = server.indexOf("await loadTraits(");
  assert.ok(listen > 0 && firstRead > 0, "les deux repères doivent exister");
  assert.ok(listen < firstRead,
    "server.listen doit précéder la première lecture, sinon un démarrage à froid est un site mort");
});

// Un 200 avec une page vide se met en cache et se lit comme une collection sans
// machines. Un 503 dit qu'on n'a pas encore, ce qui est la vérité.
test("a snapshot that has nothing yet answers 503, never an empty 200", () => {
  assert.match(server, /res\.writeHead\(p\.has \? 200 : 503/);
});

// Le banc d'essai partage le `.env` de la prod, webhook compris. Sans cette
// coupure, chaque essai sonnerait chez le porteur.
test("the staging bench cannot ring anyone's Discord", () => {
  const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
  const bench = compose.slice(compose.indexOf("rh-dashboard-staging:"));
  assert.match(bench, /DISCORD_WEBHOOK: ""/);
  // Sa propre base : le banc ne doit pas écrire dans l'historique qui sert.
  assert.match(bench, /\.\/data-staging:\/app\/data/);
  // Et derrière un profil, pour qu'un `docker compose up` nu ne le lance pas.
  assert.match(bench, /profiles: \["staging"\]/);
});

// Le banc ne doit pas prendre le port de la prod, ni être exposé par le tunnel.
test("no two services claim the same host port", () => {
  const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
  const ports = [...compose.matchAll(/"192\.168\.0\.11:(\d+):\d+"/g)].map((m) => m[1]);
  // La règle est l'unicité, pas le nombre. Figé à deux, ce test se contentait
  // de tomber le jour où un troisième service arrive — sans rien dire de plus
  // sur les ports que le compte qu'il avait appris par cœur.
  assert.ok(ports.length >= 2, "aucun port publié");
  assert.equal(new Set(ports).size, ports.length,
    `deux services écoutent sur le même port hôte : ${ports.join(", ")}`);
});

// L'ancienne version est une pièce d'archive : son image est construite une
// fois depuis un commit et ne se reconstruit pas. Lui donner un `build:` la
// ferait remplacer par le code du jour au premier `up --build`, et les deux
// adresses serviraient la même version sans que rien ne le signale.
test("the archived version cannot be rebuilt from today's code", () => {
  const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
  const block = compose.slice(compose.indexOf("rh-dashboard-legacy:"));
  assert.match(block, /image: rh-dashboard:legacy/);
  assert.doesNotMatch(block.slice(0, block.indexOf("volumes:")), /^\s+build:/m);
});

// La marche à suivre doit exister et nommer le bon port : c'est elle qui évite
// le réflexe de reconstruire la prod pour éprouver une idée.
test("the deploy note tells you to use the bench, and names its port", () => {
  const doc = readFileSync(new URL("../DEPLOY.md", import.meta.url), "utf8");
  assert.match(doc, /profile staging/);
  assert.match(doc, /3051/);
  const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
  const port = compose.match(/"192\.168\.0\.11:(\d+):\d+"[\s\S]*?data-staging/)
    ? compose.match(/"192\.168\.0\.11:(\d+):\d+"\s*\n\s*volumes:\s*\n\s*- \.\/data-staging/)?.[1]
    : null;
  if (port) assert.equal(port, "3051", "la note et le compose ne nomment pas le même port");
});
