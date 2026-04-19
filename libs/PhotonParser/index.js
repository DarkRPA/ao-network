import {Deserializer} from './Protocol16/Deserializer.js';
import {Stream} from './Protocol16/Stream.js';
import { Protocol18Deserializer } from './Protocol16/Protocol18Deserializer.js';

export const Protocol16 = {Protocol18Deserializer, Deserializer, Stream};