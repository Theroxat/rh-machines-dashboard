import { ethers } from "ethers";

const ERC20_BAL = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);

/**
 * Les soldes d'une adresse sur une liste de jetons, en un seul appel.
 *
 * Ils étaient lus un par un, en série. Dix-sept allers-retours pour une seule
 * requête HTTP : deux secondes et demie, même pour une adresse qui ne possède
 * rien. `/api/wallet` n'est ni authentifié ni limité, et le cache n'y peut
 * rien — il existe 2^160 adresses valides, donc qui veut marteler en tire une
 * nouvelle à chaque fois.
 *
 * Ce qui rend la lecture en série dangereuse et pas seulement lente : le RPC
 * est un point d'accès public partagé. S'y faire limiter arrête les balayages
 * qui alimentent tout le site, pas seulement l'onglet portefeuille.
 *
 * Le retour suit l'ordre reçu plutôt qu'une table indexée par adresse : un
 * jeton présent deux fois dans la liste écraserait son propre solde, et
 * l'appelant ne verrait jamais la collision.
 *
 * Une sous-lecture en échec vaut zéro, pas « absent » : un contrat qui ne
 * répond pas à `balanceOf` n'est pas détenu, et il n'y a rien à décider.
 */
export async function readBalances({ aggregate3, address, tokens }) {
  if (!tokens?.length) return [];
  const res = await aggregate3(tokens.map((t) => ({
    target: t.address,
    allowFailure: true,
    callData: ERC20_BAL.encodeFunctionData("balanceOf", [address]),
  })));
  return tokens.map((t, i) => {
    const r = res?.[i];
    if (!r?.[0]) return 0;
    try {
      return Number(ethers.formatUnits(ERC20_BAL.decodeFunctionResult("balanceOf", r[1])[0], t.decimals));
    } catch {
      return 0;
    }
  });
}
