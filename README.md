# Scene pack sources

Source folders for the downloadable 3D scenes of [whatsmyagentdoing](https://github.com/Charonyuu/whatsmyagentdoing).
Each folder is a `manifest.json` plus meshopt-compressed Kenney CC0 models.

Build a pack from the main branch checkout:

```bash
node scripts/pack-scene.js packs/<id>
```

then upload `dist/<id>-v<version>.tar.gz` to the `scenes` release and commit the updated `scenes.json` on main.
