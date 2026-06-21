"use strict";

function concatBytes(parts) {
  var total = 0;
  var output;
  var offset = 0;
  var index;
  var part;

  for (index = 0; index < parts.length; index += 1) {
    total += parts[index].length;
  }

  output = new Uint8Array(total);
  for (index = 0; index < parts.length; index += 1) {
    part = parts[index];
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function bytesFromHex(hex) {
  var clean = String(hex || "").replace(/\s+/g, "");
  var out = new Uint8Array(clean.length / 2);
  var index;

  for (index = 0; index < out.length; index += 1) {
    out[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }

  return out;
}

function bytesToHex(bytes) {
  var out = "";
  var index;
  var value;

  for (index = 0; index < bytes.length; index += 1) {
    value = bytes[index].toString(16);
    out += value.length === 1 ? "0" + value : value;
  }

  return out;
}

function utf8Encode(value) {
  var stringValue = String(value == null ? "" : value);
  var bytes = [];
  var index;
  var code;

  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(stringValue);
  }

  for (index = 0; index < stringValue.length; index += 1) {
    code = stringValue.charCodeAt(index);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      code = 0x10000 + ((code & 0x3ff) << 10) + (stringValue.charCodeAt(index) & 0x3ff);
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }

  return new Uint8Array(bytes);
}

function utf8Decode(bytes) {
  var out = "";
  var index = 0;
  var first;
  var second;
  var third;
  var fourth;
  var code;

  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  while (index < bytes.length) {
    first = bytes[index];
    if (first < 0x80) {
      out += String.fromCharCode(first);
      index += 1;
    } else if (first < 0xe0) {
      second = bytes[index + 1];
      out += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
      index += 2;
    } else if (first < 0xf0) {
      second = bytes[index + 1];
      third = bytes[index + 2];
      out += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
      index += 3;
    } else {
      second = bytes[index + 1];
      third = bytes[index + 2];
      fourth = bytes[index + 3];
      code = ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      index += 4;
    }
  }

  return out;
}

function decimalToBytesLE(value, byteLength) {
  var decimal = String(value == null ? "0" : value).trim();
  var negative = decimal[0] === "-";
  var digits = negative ? decimal.slice(1) : decimal;
  var out = new Uint8Array(byteLength);
  var quotient;
  var remainder;
  var digitIndex;
  var byteIndex = 0;
  var carry;

  if (!/^\d+$/.test(digits)) {
    throw new Error("Invalid decimal integer: " + decimal);
  }

  while (digits !== "0" && byteIndex < byteLength) {
    quotient = "";
    remainder = 0;
    for (digitIndex = 0; digitIndex < digits.length; digitIndex += 1) {
      remainder = remainder * 10 + Number(digits[digitIndex]);
      if (quotient || remainder >= 256) {
        quotient += String(Math.floor(remainder / 256));
      }
      remainder %= 256;
    }
    out[byteIndex] = remainder;
    digits = quotient || "0";
    byteIndex += 1;
  }

  if (negative) {
    carry = 1;
    for (byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
      out[byteIndex] = (~out[byteIndex]) & 255;
      if (carry) {
        out[byteIndex] += 1;
        if (out[byteIndex] > 255) {
          out[byteIndex] &= 255;
        } else {
          carry = 0;
        }
      }
    }
  }

  return out;
}

function bytesLEToDecimal(bytes, signed) {
  var negative = signed === true && bytes.length > 0 && (bytes[bytes.length - 1] & 0x80) !== 0;
  var work = new Uint8Array(bytes);
  var digits = [0];
  var index;
  var carry;
  var digitIndex;
  var value;

  if (negative) {
    carry = 1;
    for (index = 0; index < work.length; index += 1) {
      work[index] = (~work[index]) & 255;
      if (carry) {
        work[index] += 1;
        if (work[index] > 255) {
          work[index] &= 255;
        } else {
          carry = 0;
        }
      }
    }
  }

  for (index = work.length - 1; index >= 0; index -= 1) {
    carry = work[index];
    for (digitIndex = 0; digitIndex < digits.length; digitIndex += 1) {
      value = digits[digitIndex] * 256 + carry;
      digits[digitIndex] = value % 10;
      carry = Math.floor(value / 10);
    }
    while (carry > 0) {
      digits.push(carry % 10);
      carry = Math.floor(carry / 10);
    }
  }

  digits = digits.reverse().join("").replace(/^0+/, "") || "0";
  return negative && digits !== "0" ? "-" + digits : digits;
}

function int64ToBytesLE(value) {
  var out;
  var big;
  var index;

  if (typeof BigInt === "function") {
    big = BigInt(value == null ? 0 : value);
    if (big < 0) {
      big = (BigInt(1) << BigInt(64)) + big;
    }
    out = new Uint8Array(8);
    for (index = 0; index < 8; index += 1) {
      out[index] = Number((big >> BigInt(index * 8)) & BigInt(255));
    }
    return out;
  }

  return decimalToBytesLE(value, 8);
}

function bytesLEToInt64(bytes, signed) {
  var big;
  var index;

  if (typeof BigInt === "function") {
    big = BigInt(0);
    for (index = 0; index < bytes.length; index += 1) {
      big |= BigInt(bytes[index]) << BigInt(index * 8);
    }
    if (signed === true && bytes.length === 8 && (bytes[7] & 0x80) !== 0) {
      big -= BigInt(1) << BigInt(64);
    }
    return big.toString();
  }

  return bytesLEToDecimal(bytes, signed);
}

function padLength(length, prefixLength) {
  var remainder = (length + prefixLength) % 4;
  return remainder === 0 ? 0 : 4 - remainder;
}

function ByteWriter() {
  this.parts = [];
  this.length = 0;
}

ByteWriter.prototype.writeRaw = function(bytes) {
  var value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  this.parts.push(value);
  this.length += value.length;
};

ByteWriter.prototype.writeByte = function(value) {
  this.writeRaw(new Uint8Array([Number(value) & 255]));
};

ByteWriter.prototype.writeInt32 = function(value) {
  var out = new Uint8Array(4);
  var next = Number(value) | 0;
  out[0] = next & 255;
  out[1] = (next >>> 8) & 255;
  out[2] = (next >>> 16) & 255;
  out[3] = (next >>> 24) & 255;
  this.writeRaw(out);
};

ByteWriter.prototype.writeUInt32 = function(value) {
  this.writeInt32(Number(value) >>> 0);
};

ByteWriter.prototype.writeInt64 = function(value) {
  this.writeRaw(int64ToBytesLE(value));
};

ByteWriter.prototype.writeDouble = function(value) {
  var buffer = new ArrayBuffer(8);
  var view = new DataView(buffer);
  view.setFloat64(0, Number(value || 0), true);
  this.writeRaw(new Uint8Array(buffer));
};

ByteWriter.prototype.writeTlBytes = function(bytes) {
  var value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  var padding;
  var header;

  if (value.length < 254) {
    header = new Uint8Array([value.length]);
    padding = padLength(value.length, 1);
  } else {
    header = new Uint8Array([
      254,
      value.length & 255,
      (value.length >>> 8) & 255,
      (value.length >>> 16) & 255
    ]);
    padding = padLength(value.length, 4);
  }

  this.writeRaw(header);
  this.writeRaw(value);
  if (padding > 0) {
    this.writeRaw(new Uint8Array(padding));
  }
};

ByteWriter.prototype.writeString = function(value) {
  this.writeTlBytes(utf8Encode(value));
};

ByteWriter.prototype.result = function() {
  return concatBytes(this.parts);
};

function ByteReader(bytes) {
  this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  this.offset = 0;
}

ByteReader.prototype.remaining = function() {
  return this.bytes.length - this.offset;
};

ByteReader.prototype.readRaw = function(length) {
  var end = this.offset + length;
  var value;

  if (end > this.bytes.length) {
    throw new Error("Not enough bytes to read " + length + " bytes.");
  }

  value = this.bytes.slice(this.offset, end);
  this.offset = end;
  return value;
};

ByteReader.prototype.readByte = function() {
  return this.readRaw(1)[0];
};

ByteReader.prototype.readInt32 = function() {
  var bytes = this.readRaw(4);
  var value = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) | 0;
  return value;
};

ByteReader.prototype.readUInt32 = function() {
  return this.readInt32() >>> 0;
};

ByteReader.prototype.readInt64 = function(signed) {
  return bytesLEToInt64(this.readRaw(8), signed !== false);
};

ByteReader.prototype.readDouble = function() {
  var buffer = this.readRaw(8);
  var view = new DataView(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  return view.getFloat64(0, true);
};

ByteReader.prototype.readTlBytes = function() {
  var first = this.readByte();
  var length;
  var padding;
  var data;

  if (first === 254) {
    length = this.readByte() | (this.readByte() << 8) | (this.readByte() << 16);
    padding = padLength(length, 4);
  } else {
    length = first;
    padding = padLength(length, 1);
  }

  data = this.readRaw(length);
  if (padding > 0) {
    this.readRaw(padding);
  }
  return data;
};

ByteReader.prototype.readString = function() {
  return utf8Decode(this.readTlBytes());
};

module.exports = {
  ByteReader: ByteReader,
  ByteWriter: ByteWriter,
  bytesFromHex: bytesFromHex,
  bytesToHex: bytesToHex,
  bytesLEToDecimal: bytesLEToDecimal,
  concatBytes: concatBytes,
  decimalToBytesLE: decimalToBytesLE,
  int64ToBytesLE: int64ToBytesLE,
  bytesLEToInt64: bytesLEToInt64,
  utf8Decode: utf8Decode,
  utf8Encode: utf8Encode
};
