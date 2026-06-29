import { getMockRawSchedules } from "@/services/mockSchedules.js";

export async function POST(request) {
  try {
    const { StudentID } = await request.json();
    if (!StudentID) {
      return Response.json({ error: "Missing StudentID" }, { status: 400 });
    }
    
    const rawSchedules = getMockRawSchedules(StudentID);
    return Response.json({
      data: [
        null,
        null,
        rawSchedules
      ]
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
