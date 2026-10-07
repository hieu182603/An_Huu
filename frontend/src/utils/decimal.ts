/**
 * Arbitrary precision decimal for financial calculations.
 * Avoids IEEE-754 precision loss and MAX_SAFE_INTEGER limits.
 */
export class Decimal {
  private bi: bigint;
  private scale: number;

  constructor(val: string | number | bigint | Decimal = 0) {
    if (val instanceof Decimal) {
      this.bi = val.bi;
      this.scale = val.scale;
      return;
    }
    const str = typeof val === "number" ? (Number.isFinite(val) ? val.toString() : "0") : String(val).trim();
    if (!str || str === "NaN" || str === "Infinity" || str === "-Infinity") {
      this.bi = 0n;
      this.scale = 0;
      return;
    }

    let isNeg = false;
    let s = str;
    if (s.startsWith("-")) {
      isNeg = true;
      s = s.slice(1);
    } else if (s.startsWith("+")) {
      s = s.slice(1);
    }

    const dotIdx = s.indexOf(".");
    if (dotIdx === -1) {
      this.scale = 0;
      this.bi = BigInt(s || "0") * (isNeg ? -1n : 1n);
    } else {
      const intPart = s.slice(0, dotIdx) || "0";
      const fracPart = s.slice(dotIdx + 1);
      this.scale = fracPart.length;
      this.bi = BigInt(intPart + fracPart) * (isNeg ? -1n : 1n);
    }
    this.normalize();
  }

  private normalize() {
    if (this.bi === 0n) {
      this.scale = 0;
      return;
    }
    // Remove trailing zeros from fraction
    while (this.scale > 0 && this.bi % 10n === 0n) {
      this.bi /= 10n;
      this.scale--;
    }
  }

  private static align(a: Decimal, b: Decimal): [bigint, bigint, number] {
    const maxScale = Math.max(a.scale, b.scale);
    let aVal = a.bi;
    for (let i = a.scale; i < maxScale; i++) aVal *= 10n;
    let bVal = b.bi;
    for (let i = b.scale; i < maxScale; i++) bVal *= 10n;
    return [aVal, bVal, maxScale];
  }

  static max(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    const da = a instanceof Decimal ? a : new Decimal(a);
    const db = b instanceof Decimal ? b : new Decimal(b);
    return da.gt(db) ? da : db;
  }

  static min(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    const da = a instanceof Decimal ? a : new Decimal(a);
    const db = b instanceof Decimal ? b : new Decimal(b);
    return da.lt(db) ? da : db;
  }

  plus(other: Decimal | string | number): Decimal {
    const b = other instanceof Decimal ? other : new Decimal(other);
    const [aVal, bVal, scale] = Decimal.align(this, b);
    const res = new Decimal();
    res.bi = aVal + bVal;
    res.scale = scale;
    res.normalize();
    return res;
  }

  minus(other: Decimal | string | number): Decimal {
    const b = other instanceof Decimal ? other : new Decimal(other);
    const [aVal, bVal, scale] = Decimal.align(this, b);
    const res = new Decimal();
    res.bi = aVal - bVal;
    res.scale = scale;
    res.normalize();
    return res;
  }

  isZero(): boolean {
    return this.bi === 0n;
  }

  gt(other: Decimal | string | number): boolean {
    const b = other instanceof Decimal ? other : new Decimal(other);
    const [aVal, bVal] = Decimal.align(this, b);
    return aVal > bVal;
  }

  lt(other: Decimal | string | number): boolean {
    const b = other instanceof Decimal ? other : new Decimal(other);
    const [aVal, bVal] = Decimal.align(this, b);
    return aVal < bVal;
  }

  toFixed(): string {
    if (this.bi === 0n) return "0";
    const isNeg = this.bi < 0n;
    const absVal = isNeg ? -this.bi : this.bi;
    const s = absVal.toString();
    let res: string;
    if (this.scale === 0) {
      res = s;
    } else if (s.length <= this.scale) {
      res = "0." + "0".repeat(this.scale - s.length) + s;
    } else {
      const split = s.length - this.scale;
      res = s.slice(0, split) + "." + s.slice(split);
    }
    return isNeg ? "-" + res : res;
  }
}
