"""ANCS framing, based on Apple's public ANCS specification. No network or OS access."""
import struct

ANCS = '7905f431-b5ce-4e99-a40f-4b1e122d00d0'
SOURCE = '9fbf120d-6301-42d9-8c58-25e699a21dbd'
CONTROL = '69d1d8f3-45e1-49a8-9821-9bbdfdaad9d9'
DATA = '22eac6e9-24d6-4bb5-be44-b36ace7c7bfb'
KASPI = 'kz.kaspi.mobile'

def source_event(data):
    if len(data) != 8:
        return None
    event, flags, category, count, uid = struct.unpack('<BBBBI', data)
    return dict(event=event, flags=flags, category=category, uid=uid, preexisting=bool(flags & 4))

def request(uid, attributes):
    out = bytearray(struct.pack('<BI', 0, uid))
    for attribute in attributes:
        out.append(attribute)
        if attribute in (1, 2, 3):
            out.extend(struct.pack('<H', 1024))
    return bytes(out)

class Response:
    def __init__(self, uid, attributes):
        self.uid = uid
        self.attributes = set(attributes)
        self.buffer = bytearray()

    def feed(self, chunk):
        self.buffer.extend(chunk)
        if len(self.buffer) > 8192:
            raise ValueError('ANCS response too large')
        if len(self.buffer) < 5:
            return None
        if self.buffer[0] != 0 or struct.unpack_from('<I', self.buffer, 1)[0] != self.uid:
            raise ValueError('ANCS response does not match request')
        attrs, offset = {}, 5
        while offset + 3 <= len(self.buffer):
            attr, length = struct.unpack_from('<BH', self.buffer, offset)
            offset += 3
            if offset + length > len(self.buffer):
                return None
            attrs[attr] = bytes(self.buffer[offset:offset + length]).decode('utf-8', errors='replace')
            offset += length
            if self.attributes <= attrs.keys():
                return attrs
        return None
