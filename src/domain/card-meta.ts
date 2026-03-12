import { type CardId } from "./cards.js";

export type CardCategory = "gwang" | "yeolkkeut" | "tti" | "pi";

export interface CardMeta {
  cardId: CardId;
  month: number;
  category: CardCategory;
  pointValue: number;
  label: string;
}

const ENTRIES = [
  ["01_1", 1, 20, "Pine Crane Bright"],
  ["01_2", 1, 0, "Pine Plain 1"],
  ["01_3", 1, 5, "Pine Red Ribbon"],
  ["01_4", 1, 0, "Pine Plain 2"],
  ["02_1", 2, 10, "Plum Bird"],
  ["02_2", 2, 0, "Plum Plain 1"],
  ["02_3", 2, 5, "Plum Red Ribbon"],
  ["02_4", 2, 0, "Plum Plain 2"],
  ["03_1", 3, 20, "Cherry Curtain Bright"],
  ["03_2", 3, 0, "Cherry Plain 1"],
  ["03_3", 3, 5, "Cherry Red Ribbon"],
  ["03_4", 3, 0, "Cherry Plain 2"],
  ["04_1", 4, 10, "Wisteria Cuckoo"],
  ["04_2", 4, 0, "Wisteria Plain 1"],
  ["04_3", 4, 5, "Wisteria Ribbon"],
  ["04_4", 4, 0, "Wisteria Plain 2"],
  ["05_1", 5, 10, "Iris Bridge"],
  ["05_2", 5, 0, "Iris Plain 1"],
  ["05_3", 5, 5, "Iris Ribbon"],
  ["05_4", 5, 0, "Iris Plain 2"],
  ["06_1", 6, 10, "Peony Butterfly"],
  ["06_2", 6, 0, "Peony Plain 1"],
  ["06_3", 6, 5, "Peony Blue Ribbon"],
  ["06_4", 6, 0, "Peony Plain 2"],
  ["07_1", 7, 10, "Bush Clover Boar"],
  ["07_2", 7, 0, "Bush Clover Ribbon"],
  ["07_3", 7, 5, "Bush Clover Plain 1"],
  ["07_4", 7, 0, "Bush Clover Plain 2"],
  ["08_1", 8, 20, "Susuki Moon Bright"],
  ["08_2", 8, 0, "Susuki Geese"],
  ["08_3", 8, 10, "Susuki Plain 1"],
  ["08_4", 8, 0, "Susuki Plain 2"],
  ["09_1", 9, 10, "Chrysanthemum Cup"],
  ["09_2", 9, 0, "Chrysanthemum Plain 1"],
  ["09_3", 9, 5, "Chrysanthemum Blue Ribbon"],
  ["09_4", 9, 0, "Chrysanthemum Plain 2"],
  ["10_1", 10, 10, "Maple Deer"],
  ["10_2", 10, 0, "Maple Blue Ribbon"],
  ["10_3", 10, 5, "Maple Plain 1"],
  ["10_4", 10, 0, "Maple Plain 2"],
  ["11_1", 11, 20, "Paulownia Bright"],
  ["11_2", 11, 0, "Paulownia Plain 1"],
  ["11_3", 11, 10, "Paulownia Plain 2"],
  ["11_4", 11, 0, "Paulownia Plain 3"],
  ["12_1", 12, 20, "Rain Bright"],
  ["12_2", 12, 10, "Rain Swallow"],
  ["12_3", 12, 5, "Rain Ribbon"],
  ["12_4", 12, 0, "Rain Lightning"]
] as const satisfies readonly [CardId, number, number, string][];

export const CARD_META_BY_ID: Record<CardId, CardMeta> = Object.fromEntries(
  ENTRIES.map(([cardId, month, pointValue, label]) => [
    cardId,
    {
      cardId,
      month,
      category: getCategoryForPointValue(pointValue),
      pointValue,
      label
    }
  ])
) as Record<CardId, CardMeta>;

function getCategoryForPointValue(pointValue: number): CardCategory {
  switch (pointValue) {
    case 20:
      return "gwang";
    case 10:
      return "yeolkkeut";
    case 5:
      return "tti";
    case 0:
      return "pi";
    default:
      throw new Error(`Unsupported card point value: ${pointValue}.`);
  }
}

export function getCardMeta(cardId: CardId): CardMeta {
  const meta = CARD_META_BY_ID[cardId];
  if (meta === undefined) {
    throw new Error(`Card metadata not found for ${cardId}.`);
  }

  return meta;
}
