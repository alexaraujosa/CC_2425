#pragma description Schema Packaging binary format
#pragma endian big
#pragma once

#include <std/io.pat>

enum SPACKType: u8 {
    U8     = 1,
    U16    = 2,
    U32    = 3,
    S8     = 4,
    S16    = 5,
    S32    = 6,
    FLOAT  = 7,
    DOUBLE = 8,
    OBJECT = 255
};

using SPACKSerialized;
using SPACKObjectEntry;

struct SPACKObject {
    u8 size;
    SPACKObjectEntry values[size];
};

struct _SPACKValue<auto type> {
    match(type) {
        (SPACKType::U8):     u8 data;
        (SPACKType::U16):    u16 data;
        (SPACKType::U32):    u32 data;
        (SPACKType::S8):     s8 data;
        (SPACKType::S16):    s16 data;
        (SPACKType::S32):    s32 data;
        (SPACKType::FLOAT):  float data;
        (SPACKType::DOUBLE): double data;
        (SPACKType::OBJECT): SPACKObject data;
    }
};

struct SPACKObjectEntry {
    u8 key;
    SPACKType etype;
    _SPACKValue<etype> value [[inline]];
};

struct SPACKSerialized {
    SPACKType type;
    _SPACKValue<type> value [[inline]];
};

SPACKSerialized val @ 0x0;