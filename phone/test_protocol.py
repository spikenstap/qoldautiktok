import struct
import unittest
from ancs_protocol import source_event, request, Response

class ProtocolTest(unittest.TestCase):
    def test_source(self):
        event=source_event(struct.pack('<BBBBI',0,4,1,1,4294967295))
        self.assertTrue(event['preexisting'])
        self.assertEqual(event['uid'],4294967295)
        self.assertIsNone(source_event(b'bad'))

    def test_request_and_fragmented_response(self):
        self.assertEqual(request(123,[0,1,3,5]),struct.pack('<BI',0,123)+b'\x00\x01\x00\x04\x03\x00\x04\x05')
        fields={1:'Kaspi',3:'Ә ғ қ ң ө ұ ү һ і',5:'20261121T120000'}
        data=struct.pack('<BI',0,123)
        for key,value in fields.items():
            encoded=value.encode('utf-8');data+=struct.pack('<BH',key,len(encoded))+encoded
        for size in range(1,len(data)+1):
            reader=Response(123,fields.keys());value=None
            for i in range(0,len(data),size):
                value=reader.feed(data[i:i+size])
            self.assertEqual(value,fields)

    def test_wrong_uid_and_limits(self):
        with self.assertRaises(ValueError):Response(123,[0]).feed(struct.pack('<BI',0,124))
        with self.assertRaises(ValueError):Response(123,[0]).feed(b'x'*9000)

if __name__=='__main__':unittest.main()
