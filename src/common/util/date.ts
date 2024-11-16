function loggerFormatDate(date: Date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function loggerRawFormatDate(date: Date) {
    return date.toISOString();
}

/**
 * Converts a string representing an interval of time into it's corresponding time, in milliseconds.  
 * The string is supposed to be in the format `<DD>d<HH>h<MM>m<SS>s<MS>ms`, with any of it's number and identifier pair
 * being optional.
 * 
 * An NaN is returned if the string is not formatted correctly.
 * 
 * @param str A string representing an interval of time.
 * @returns The corresponding time, in milliseconds, or NaN if invalid.
 */
function parseStringInterval(str: string): number {
    let time = 0;
    let buf = "";
    
    for (let i = 0; i < str.length; i++) {
        if (str[i].match(/\d/)) buf += str[i];
        else {
            switch (str[i]) {
                case "s": {
                    time += parseInt(buf, 10) * 1000;
                    break;
                }
                case "m": {
                    // Milliseconds
                    if (i + 1 < str.length && str[i + 1] === "s") {
                        time += parseInt(buf, 10);
                        i++;
                    } else {
                        time += parseInt(buf, 10) * 60000;
                    }
                    break;
                }
                case "h": {
                    time += parseInt(buf, 10) * 3600000;
                    break;
                }
                case "d": {
                    time += parseInt(buf, 10) * 3600000 * 24;
                    break;
                }
                default: {
                    return NaN;
                }
            }

            buf = "";
        }
    }

    return time;
}

export {
    loggerFormatDate,
    loggerRawFormatDate,
    parseStringInterval
};