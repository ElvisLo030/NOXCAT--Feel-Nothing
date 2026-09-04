# Third-party notices

This notice covers third-party binary and model material checked directly into
this repository. These components are not licensed under this project's
`GPL-3.0-only` grant. Dependencies installed through npm remain governed by
the license information shipped with their respective packages.

## MediaPipe Tasks Vision 0.10.35

The files under `public/vendor/mediapipe/wasm/` are unmodified, byte-for-byte
copies of the WASM runtime distributed with
[`@mediapipe/tasks-vision` version 0.10.35](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.35).
The package identifies its license as Apache License 2.0.

- Upstream project: <https://github.com/google-ai-edge/mediapipe>
- Version-matched license copy:
  `third_party/licenses/MediaPipe-Apache-2.0.txt`

## MediaPipe Face Landmarker model

`public/models/face_landmarker.task` is the Google MediaPipe Face Landmarker
model bundle obtained from:

<https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task>

SHA-256 of the copy in this repository:

```text
64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF
```

The bundle contains BlazeFace Short Range, Face Mesh V2, and Blendshape V2
components. Their official model cards identify the models as released under
Apache License 2.0:

- [BlazeFace Short Range model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf)
- [Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf)
- [Blendshape V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)

The version-matched MediaPipe license copy is at
`third_party/licenses/MediaPipe-Apache-2.0.txt`.

All third-party names and marks belong to their respective owners.
