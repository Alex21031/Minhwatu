import { type CardId } from "./cards.js";

export type CardCategory = "gwang" | "yeolkkeut" | "tti" | "pi";

export interface CardMeta {
  cardId: CardId;
  month: number;
  category: CardCategory;
  label: string;
}

const ENTRIES = [
  ["01_1", 1, "gwang", "Pine Crane Bright"],
  ["01_2", 1, "pi", "Pine Plain 1"],
  ["01_3", 1, "tti", "Pine Red Ribbon"],
  ["01_4", 1, "pi", "Pine Plain 2"],
  ["02_1", 2, "yeolkkeut", "Plum Bird"],
  ["02_2", 2, "pi", "Plum Plain 1"],
  ["02_3", 2, "tti", "Plum Red Ribbon"],
  ["02_4", 2, "pi", "Plum Plain 2"],
  ["03_1", 3, "gwang", "Cherry Curtain Bright"],
  ["03_2", 3, "pi", "Cherry Plain 1"],
  ["03_3", 3, "tti", "Cherry Red Ribbon"],
  ["03_4", 3, "pi", "Cherry Plain 2"],
  ["04_1", 4, "yeolkkeut", "Wisteria Cuckoo"],
  ["04_2", 4, "pi", "Wisteria Plain 1"],
  ["04_3", 4, "tti", "Wisteria Ribbon"],
  ["04_4", 4, "pi", "Wisteria Plain 2"],
  ["05_1", 5, "yeolkkeut", "Iris Bridge"],
  ["05_2", 5, "pi", "Iris Plain 1"],
  ["05_3", 5, "tti", "Iris Ribbon"],
  ["05_4", 5, "pi", "Iris Plain 2"],
  ["06_1", 6, "yeolkkeut", "Peony Butterfly"],
  ["06_2", 6, "pi", "Peony Plain 1"],
  ["06_3", 6, "tti", "Peony Blue Ribbon"],
  ["06_4", 6, "pi", "Peony Plain 2"],
  ["07_1", 7, "yeolkkeut", "Bush Clover Boar"],
  ["07_2", 7, "tti", "Bush Clover Ribbon"],
  ["07_3", 7, "pi", "Bush Clover Plain 1"],
  ["07_4", 7, "pi", "Bush Clover Plain 2"],
  ["08_1", 8, "gwang", "Susuki Moon Bright"],
  ["08_2", 8, "yeolkkeut", "Susuki Geese"],
  ["08_3", 8, "pi", "Susuki Plain 1"],
  ["08_4", 8, "pi", "Susuki Plain 2"],
  ["09_1", 9, "yeolkkeut", "Chrysanthemum Cup"],
  ["09_2", 9, "pi", "Chrysanthemum Plain 1"],
  ["09_3", 9, "tti", "Chrysanthemum Blue Ribbon"],
  ["09_4", 9, "pi", "Chrysanthemum Plain 2"],
  ["10_1", 10, "yeolkkeut", "Maple Deer"],
  ["10_2", 10, "tti", "Maple Blue Ribbon"],
  ["10_3", 10, "pi", "Maple Plain 1"],
  ["10_4", 10, "pi", "Maple Plain 2"],
  ["11_1", 11, "gwang", "Willow Rain Bright"],
  ["11_2", 11, "yeolkkeut", "Willow Swallow"],
  ["11_3", 11, "tti", "Willow Ribbon"],
  ["11_4", 11, "yeolkkeut", "Willow Lightning"],
  ["12_1", 12, "gwang", "Paulownia Bright"],
  ["12_2", 12, "pi", "Paulownia Plain 1"],
  ["12_3", 12, "pi", "Paulownia Plain 2"],
  ["12_4", 12, "pi", "Paulownia Plain 3"]
] as const satisfies readonly [CardId, number, CardCategory, string][];

export const CARD_META_BY_ID: Record<CardId, CardMeta> = Object.fromEntries(
  ENTRIES.map(([cardId, month, category, label]) => [
    cardId,
    {
      cardId,
      month,
      category,
      label
    }
  ])
) as Record<CardId, CardMeta>;

export function getCardMeta(cardId: CardId): CardMeta {
  const meta = CARD_META_BY_ID[cardId];
  if (meta === undefined) {
    throw new Error(`Card metadata not found for ${cardId}.`);
  }

  return meta;
}
