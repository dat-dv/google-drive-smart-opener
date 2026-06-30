import * as fs from 'fs'
import * as crypto from 'crypto'

/**
 * Computes the MD5 checksum of a file.
 * MD5 is the standard hash format used by Google Drive's API and client configurations.
 * Reads the file as a stream to avoid loading large files into memory.
 */
export async function calculateFileMd5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)

    stream.on('data', (chunk) => {
      hash.update(chunk)
    })

    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })

    stream.on('error', (error) => {
      reject(error)
    })
  })
}
