import { describe, expect, it } from "vitest";
import { normalise, singularise } from "@/lib/normalise";

describe("normalise: individual steps", () => {
  it.each([
    // NFKC: full-width and ligatures
    ["ＴＥＳＣＯ", "tesco"],
    ["ﬁsh", "fish"],
    // diacritics
    ["Café Nero", "cafe nero"],
    ["Pokémon", "pokemon"],
    ["Brontë", "bronte"],
    // lowercase
    ["GREGGS", "gregg"],
    // ampersand
    ["M&S", "m and s"],
    ["Marks & Spencer", "mark and spencer"],
    ["Marks and Spencer", "mark and spencer"],
    // apostrophes vanish, curly or straight
    ["Sainsbury's", "sainsbury"],
    ["Sainsbury’s", "sainsbury"],
    ["Sainsburys", "sainsbury"],
    ["Hellmann's", "hellmann"],
    // other punctuation becomes a space
    ["Coca-Cola", "coca cola"],
    ["Irn-Bru!", "irn bru"],
    ["Mr. Kipling", "mr kipling"],
    ["  Jaffa   Cakes  ", "jaffa cake"],
    ["Hob/Nobs", "hob nob"],
    ['"Marmite"', "marmite"],
    // whitespace incl. tabs, newlines, non-breaking spaces
    ["Bakewell\t\ttart", "bakewell tart"],
    ["Yorkshire\npudding", "yorkshire pudding"],
    ["Pork pie", "pork pie"],
    // leading article stripped once, only when followed by something
    ["The Archers", "archer"],
    ["the  Beatles", "beatle"],
    ["A Bakewell tart", "bakewell tart"],
    ["An apple", "apple"],
    ["The The", "the"],
    ["The", "the"],
    ["a", "a"],
    ["Theatre", "theatre"],
    ["Another", "another"],
    // numbers are kept
    ["7 Up", "7 up"],
    ["Heinz 57", "heinz 57"],
    // emptiness
    ["", ""],
    ["   ", ""],
    ["!!!", ""],
    ["’", ""],
  ])("%j → %j", (raw, expected) => {
    expect(normalise(raw)).toBe(expected);
  });
});

describe("singularise", () => {
  it.each([
    ["berries", "berry"],
    ["pies", "pie"], // 4 letters: too short for the -ies rule, so the -s rule applies
    ["glasses", "glass"],
    ["glass", "glass"],
    ["bus", "bus"],
    ["crisis", "crisis"],
    ["dishes", "dish"],
    ["matches", "match"],
    ["boxes", "box"],
    ["fingers", "finger"],
    ["tacos", "taco"],
    ["crisps", "crisp"],
    ["gas", "gas"],
    ["yes", "yes"],
    ["7s", "7s"],
    ["fish", "fish"],
    ["éclairs", "éclair"],
  ])("%s → %s", (word, expected) => {
    expect(singularise(word)).toBe(expected);
  });
});

describe("normalise: equivalences players will rely on", () => {
  it.each([
    ["Fish fingers", "fish finger", "FISH-FINGERS"],
    ["The Co-op", "co op", "co-op"],
    ["Ben & Jerry's", "Ben and Jerrys", "ben & jerrys"],
    ["Pret A Manger", "pret a manger", "PRET A MANGER!"],
    ["Ginsters pasties", "ginsters pasty", "Ginster's Pasties"],
  ])("%s ≡ %s ≡ %s", (a, b, c) => {
    expect(normalise(a)).toBe(normalise(b));
    expect(normalise(b)).toBe(normalise(c));
  });
});

describe("normalise: invariants", () => {
  const samples = [
    "Marks & Spencer",
    "The Co-op",
    "Café Nero",
    "ＴＥＳＣＯ Finest",
    "Fish fingers",
    "  Mr. Kipling's   Exceedingly Good Cakes ",
    "Irn-Bru",
    "",
    "Heinz 57",
    "Pokémon",
  ];

  it.each(samples)("is idempotent for %j", (s) => {
    const once = normalise(s);
    // Re-normalising can only strip a now-leading article again; the samples avoid that.
    expect(normalise(once)).toBe(once);
  });

  it.each(samples)("output has no punctuation, capitals or stray spaces for %j", (s) => {
    const out = normalise(s);
    expect(out).toBe(out.trim());
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).not.toMatch(/[^\p{Ll}\p{Lo}\p{N} ]/u);
  });
});
