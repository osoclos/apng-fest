import { expect, test } from "vitest";
import { add } from "apng-fest";

test("adding 2 + 3", () => {
    expect(add(2, 3)).toBe(5);
});