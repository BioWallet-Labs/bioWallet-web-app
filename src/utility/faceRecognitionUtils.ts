import * as faceapi from "face-api.js";
import { SavedFace } from "../components/FaceRecognition";

export interface DetectedFace {
  detection: faceapi.FaceDetection;
  descriptor: Float32Array;
  match: faceapi.FaceMatch;
  matchedProfile?: any;
}

/**
 * Detects faces in the provided image and matches them with saved faces
 */
export async function detectFacesInImage(
  imageElement: HTMLImageElement,
  savedFaces: SavedFace[]
): Promise<DetectedFace[]> {
  console.log(`Starting face detection with ${savedFaces.length} saved faces`);

  // Create a face matcher from saved faces with a more lenient threshold
  // Default is 0.6, we're using 0.7 for better recognition
  const labeledDescriptors = savedFaces.reduce(
    (acc: faceapi.LabeledFaceDescriptors[], face) => {
      const existing = acc.find((ld) => ld.label === face.label.name);
      if (existing) {
        existing.descriptors.push(face.descriptor);
      } else {
        acc.push(
          new faceapi.LabeledFaceDescriptors(face.label.name, [face.descriptor])
        );
      }
      return acc;
    },
    []
  );

  console.log(`Created ${labeledDescriptors.length} labeled descriptors`);

  // Use a more lenient matching threshold (0.7 instead of default 0.6)
  // This allows for more successful matches at the cost of potential false positives
  const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.7);
  console.log("Face matcher created with threshold: 0.7");

  // Detect faces in the image
  console.log("Detecting faces in image...");
  const fullFaceDescriptions = await faceapi
    .detectAllFaces(imageElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  console.log(`Detected ${fullFaceDescriptions.length} faces in image`);

  // Match detected faces with saved faces
  const detectedFaces = fullFaceDescriptions.map(
    ({ detection, descriptor }) => {
      const match = faceMatcher.findBestMatch(descriptor);
      const matchedFace = savedFaces.find(
        (face) => face.label.name === match.label
      );

      console.log(
        `Face match result: ${match.label} with distance ${match.distance}`
      );
      if (matchedFace) {
        console.log(`Matched with saved face: ${matchedFace.label.name}`);
      }

      return {
        detection,
        descriptor,
        match,
        matchedProfile: matchedFace?.label,
      };
    }
  );

  // Filter out poor matches if needed for more precision
  // Uncomment this if you want to only return strong matches
  /*
  const goodMatches = detectedFaces.filter(
    face => face.match.label !== 'unknown' && face.match.distance < 0.6
  );
  
  console.log(`Filtered to ${goodMatches.length} good matches`);
  return goodMatches;
  */

  console.log(`Returning ${detectedFaces.length} matched faces`);
  return detectedFaces;
}

/**
 * Finds the largest face in the detected faces
 */
export function findLargestFace(
  detectedFaces: DetectedFace[]
): DetectedFace | null {
  if (detectedFaces.length === 0) {
    console.log("No faces to find largest from");
    return null;
  }

  // Find the face with the largest detection box area
  const largestFace = detectedFaces.reduce((largest, current) => {
    const largestArea =
      largest.detection.box.width * largest.detection.box.height;
    const currentArea =
      current.detection.box.width * current.detection.box.height;
    return currentArea > largestArea ? current : largest;
  }, detectedFaces[0]);

  console.log(
    `Found largest face: ${largestFace.match.label} with area ${
      largestFace.detection.box.width * largestFace.detection.box.height
    }`
  );

  return largestFace;
}

/**
 * Creates an image element from a data URL
 */
export function createImageFromDataUrl(
  dataUrl: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
