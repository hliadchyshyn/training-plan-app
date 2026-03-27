declare module '@garmin/fitsdk' {
  export class Encoder {
    constructor(options?: { fieldDescriptions?: unknown })
    writeMesg(mesg: Record<string, unknown>): this
    close(): Uint8Array
  }
  export class Decoder {
    constructor(stream: Stream)
    isFIT(): boolean
    checkIntegrity(): boolean
    read(options?: unknown): { messages: unknown; errors: unknown[] }
  }
  export class Stream {
    static fromBuffer(buffer: Uint8Array): Stream
    static fromByteArray(byteArray: number[]): Stream
    static fromArrayBuffer(arrayBuffer: ArrayBuffer): Stream
  }
  export const Profile: unknown
  export const Utils: unknown
}
