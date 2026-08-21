import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchMetadata, readCache, writeCache, backfillMetadata, loadMetadata } from "../src/metadata.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "rh-meta-")), "metadata.json");

const nft = (id, headwear, over = {}) => ({
  identifier: String(id),
  display_image_url: `https://img/${id}.webp`,
  image_url: `https://fallback/${id}.webp`,
  traits: [
    { trait_type: "Body", value: "Sky" },
    { trait_type: "Headwear", value: headwear },
    { trait_type: "Eyes", value: "Rage" },
  ],
  ...over,
});

const fakeFetch = (pages) => {
  let call = 0;
  return async () => {
    const page = pages[call++];
    if (!page) throw new Error("fetched more pages than the test provided");
    return { ok: true, status: 200, json: async () => page };
  };
};

test("each machine keeps its image and every trait that varies", async () => {
  const { meta } = await fetchMetadata({
    apiKey: "k", maxPages: 5,
    fetchImpl: fakeFetch([{ nfts: [nft(1253, "Blueberries")], next: null }]),
  });
  assert.deepEqual(meta.get(1253), {
    image: "https://img/1253.webp",
    headwear: "Blueberries",
    body: "Sky",
    eyes: "Rage", desk: null, weight: null, multiplier: null, wallet: null,
  });
});

// Le cache écrit par une version antérieure ne portait pas Eyes. Le relire tel
// quel donnerait un filtre qui ne trouve jamais rien, sans la moindre erreur.
test("a cache written by an older shape is refused, not partially trusted", () => {
  const path = tmp();
  writeFileSync(path, JSON.stringify({ 1: { image: "u", headwear: "Halo", body: "Sky" } }));
  assert.equal(readCache(path), null);
});

test("the cursor is followed to the end of the collection", async () => {
  const { meta, pages } = await fetchMetadata({
    apiKey: "k", maxPages: 5,
    fetchImpl: fakeFetch([
      { nfts: [nft(1, "Bowler")], next: "p2" },
      { nfts: [nft(2, "Blade")], next: null },
    ]),
  });
  assert.equal(pages, 2);
  assert.equal(meta.size, 2);
});

test("a collection that outruns maxPages throws rather than caching a partial map", async () => {
  await assert.rejects(
    fetchMetadata({ apiKey: "k", maxPages: 1, fetchImpl: fakeFetch([{ nfts: [nft(1, "Halo")], next: "more" }]) }),
    /not exhausted/,
  );
});

test("an HTTP error is raised, never swallowed into an empty map", async () => {
  await assert.rejects(
    fetchMetadata({ apiKey: "k", maxPages: 5, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) }),
    /429/,
  );
});

test("display_image_url wins, but image_url is used when it is missing", async () => {
  const { meta } = await fetchMetadata({
    apiKey: "k", maxPages: 5,
    fetchImpl: fakeFetch([{ nfts: [nft(7, "Fez", { display_image_url: null })], next: null }]),
  });
  assert.equal(meta.get(7).image, "https://fallback/7.webp");
});

test("a machine with no headwear is recorded as bare-headed, not as unknown", async () => {
  // "None" is the on-chain reality of the x6 class: 81 machines wear nothing.
  // Collapsing it to null would erase the second-rarest tier.
  const { meta } = await fetchMetadata({
    apiKey: "k", maxPages: 5,
    fetchImpl: fakeFetch([{ nfts: [nft(4599, "None")], next: null }]),
  });
  assert.equal(meta.get(4599).headwear, "None");
});

test("an entry with no usable image is skipped and counted, never half-stored", async () => {
  const { meta, skipped } = await fetchMetadata({
    apiKey: "k", maxPages: 5,
    fetchImpl: fakeFetch([{
      nfts: [nft(1, "Halo"), nft(2, "Halo", { display_image_url: null, image_url: null }), { identifier: "abc" }],
      next: null,
    }]),
  });
  assert.equal(meta.size, 1);
  assert.equal(skipped, 2);
});

// La pagination en lot d'OpenSea a réellement perdu le token 765 sur les 10 000
// le 2026-08-16 : présent sur l'endpoint individuel, absent des 50 pages.
// Un trou qu'on sait combler ne reste pas un trou.
test("machines the bulk pages dropped are fetched one by one", async () => {
  const meta = new Map([[1, { image: "u", headwear: "Fez", body: "Sky", eyes: "UwU", desk: null, weight: null, multiplier: null, wallet: null }]]);
  const asked = [];
  const filled = await backfillMetadata({
    apiKey: "k", meta, wanted: [1, 765], limit: 50,
    fetchImpl: async (url) => {
      asked.push(String(url).split("/").pop());
      return { ok: true, status: 200, json: async () => ({
        nft: { identifier: "765", display_image_url: "https://img/765.webp",
               traits: [{ trait_type: "Headwear", value: "Fez" }, { trait_type: "Body", value: "Cobalt" }] },
      }) };
    },
  });
  assert.deepEqual(asked, ["765"]);          // le 1 déjà connu n'est pas redemandé
  assert.equal(filled, 1);
  assert.deepEqual(meta.get(765), { image: "https://img/765.webp", headwear: "Fez", body: "Cobalt", eyes: null, desk: null, weight: null, multiplier: null, wallet: null });
});

test("a backfill that fails leaves the map alone rather than poisoning it", async () => {
  const meta = new Map();
  const filled = await backfillMetadata({
    apiKey: "k", meta, wanted: [765], limit: 50,
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  assert.equal(filled, 0);
  assert.equal(meta.has(765), false);
});

test("a backfill refuses to hammer the API when the gap is not a gap but a failure", async () => {
  const meta = new Map();
  let calls = 0;
  const filled = await backfillMetadata({
    apiKey: "k", meta, wanted: [1, 2, 3, 4, 5], limit: 2,
    fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({
      nft: { identifier: String(calls), display_image_url: "u", traits: [] } }) }; },
  });
  assert.equal(calls, 2);
  assert.equal(filled, 2);
});

test("a written cache reads back as the same map", () => {
  const path = tmp();
  writeCache(path, new Map([[1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", desk: null, weight: null, multiplier: null, wallet: null }]]));
  assert.deepEqual(readCache(path).get(1), { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", desk: null, weight: null, multiplier: null, wallet: null });
});

test("a corrupt or missing cache is treated as absent, never half-trusted", () => {
  const path = tmp();
  writeFileSync(path, "{ not json");
  assert.equal(readCache(path), null);
  assert.equal(readCache(join(tmpdir(), "absent-rh-metadata.json")), null);
});

// Les métadonnées sont scellées au mint et gardées à vie. L'équipe y ajoute
// pourtant le desk, et un cache gardé à vie ne le verrait jamais arriver.
test("a cache that predates the desk trait is dropped once the trait appears", async () => {
  const path = tmp();
  writeCache(path, new Map(Array.from({ length: 10 }, (_, i) =>
    [i + 1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", desk: null, weight: null, multiplier: null, wallet: null }])));

  let asked = 0;
  const fetchImpl = async (url) => {
    if (url.includes("/nfts/1")) {
      asked++;
      return { ok: true, json: async () => ({ nft: { traits: [{ trait_type: "Desk", value: "utilities" }] } }) };
    }
    return { ok: true, json: async () => ({ nfts: [{ identifier: "1", image_url: "u", traits: [{ trait_type: "Desk", value: "utilities" }] }], next: null }) };
  };

  const { meta } = await loadMetadata({ apiKey: "k", cachePath: path, maxPages: 1, total: 1, fetchImpl });
  assert.equal(asked, 1, "une seule machine interrogée pour le savoir");
  assert.equal(meta.get(1).desk, "utilities");
});

test("a cache that already carries desks is not thrown away for nothing", async () => {
  const path = tmp();
  writeCache(path, new Map(Array.from({ length: 10 }, (_, i) =>
    [i + 1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", desk: "utilities" }])));
  let called = 0;
  const fetchImpl = async () => { called++; return { ok: true, json: async () => ({ nfts: [], next: null }) }; };
  const { meta } = await loadMetadata({ apiKey: "k", cachePath: path, maxPages: 1, total: 10, fetchImpl });
  assert.equal(called, 0, "rien à demander");
  assert.equal(meta.size, 10);
});

// Une panne réseau ne doit pas jeter un cache valable.
test("a probe that fails keeps the cache, rather than refetching ten thousand", async () => {
  const path = tmp();
  writeCache(path, new Map(Array.from({ length: 10 }, (_, i) =>
    [i + 1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", desk: null, weight: null, multiplier: null, wallet: null }])));
  const fetchImpl = async () => { throw new Error("network down"); };
  const { meta } = await loadMetadata({ apiKey: "k", cachePath: path, maxPages: 1, total: 10, fetchImpl });
  assert.equal(meta.size, 10);
});
