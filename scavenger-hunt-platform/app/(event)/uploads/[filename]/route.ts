import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs'
import { fileTypeFromBuffer } from "file-type"
import path from 'path';
import sharp from "sharp"

// This API serves files located in the "public/files" directory
export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = await params;

  const filePath = path.join('./uploads', filename);

  console.log("filePath >>> ", filePath)

  try {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath) // Synchronously read the file into a buffer
      const contentType = (await fileTypeFromBuffer(fileBuffer).then((e) => e?.mime)) || "application/gzip" // Extract the content type

      console.log("contentType >>> ", contentType)

      // + if the content type is an image, resize it to the specified dimensions & quality
      if (contentType.startsWith("image")) {
        let image = sharp(fileBuffer)
        const resizedBuffer = await image.webp({ quality: 70 }).toBuffer()

        return new NextResponse(resizedBuffer, {
          headers: {
            "Content-Type": "image/webp",
          },
        })
      }

      // * return the file buffer as is
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": contentType,
        },
      })
    }

    return new NextResponse("File not found.", {
      status: 404,
    })
  } catch (error) {
    console.error("Error retrieving resource: ", error)
    return new NextResponse(null, {
      status: 500,
    })
  }
}


