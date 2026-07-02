import * as path from 'path'

/**
 * Guesses the MIME type based on the file extension.
 * Defaults to 'application/octet-stream' for unrecognized extensions.
 */
export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.txt':
      return 'text/plain'
    case '.html':
      return 'text/html'
    case '.pdf':
      return 'application/pdf'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.doc':
      return 'application/msword'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case '.ppt':
      return 'application/vnd.ms-powerpoint'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}
