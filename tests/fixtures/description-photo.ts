// An 8 x 8 gray JPEG, generated locally; it contains no product or personal data.
export const descriptionPhotoFixture = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwAooooA/9k=";

export function descriptionPhotoWithBytes(byteCount: number) {
  const original = Buffer.from(descriptionPhotoFixture.split(",")[1], "base64");
  const comments: Buffer[] = [];
  let remaining = byteCount - original.length;
  while (remaining >= 4) {
    let commentBytes = Math.min(remaining, 65537);
    if (remaining - commentBytes > 0 && remaining - commentBytes < 4) {
      commentBytes -= 4;
    }
    const comment = Buffer.alloc(commentBytes, 65);
    comment[0] = 0xff;
    comment[1] = 0xfe;
    comment.writeUInt16BE(comment.length - 2, 2);
    comments.push(comment);
    remaining -= comment.length;
  }
  if (remaining !== 0) {
    throw new Error("The requested fixture size cannot fit a JPEG comment.");
  }
  return `data:image/jpeg;base64,${Buffer.concat([original.subarray(0, 2), ...comments, original.subarray(2)]).toString("base64")}`;
}
