// Electron Forge: `npm run make` → out/make/dmg/<arch>/Exam Proctor-<version>-<arch>.dmg
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

// Ship only what runs: main process, preload and the Vite build. Everything else
// (src/, tests, scripts, node_modules — React is already bundled) stays out.
const KEEP = ['/package.json', '/app', '/dist']
const ignore = (file) => !!file && (/\.test\.js$/.test(file) || !KEEP.some((keep) => file === keep || file.startsWith(keep + '/')))

export default {
  packagerConfig: {
    name: 'Exam Proctor',
    appBundleId: 'com.examproctor.desktop',
    asar: true,
    ignore,
    extendInfo: {
      NSCameraUsageDescription: 'Your camera is used to verify your identity and check you are alone during the exam.',
      NSMicrophoneUsageDescription: 'Your microphone is used to detect talking or background audio during the exam.',
    },
  },
  makers: [new MakerDMG({ format: 'ULFO' }, ['darwin'])],
  hooks: {
    // extendInfo edits Info.plist after Electron's ad-hoc signature, which macOS then reports as
    // "damaged" on other machines. Re-sign ad-hoc so the bundle verifies.
    // ponytail: ad-hoc only; a Developer ID + notarization is needed to open without a Gatekeeper prompt
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin') return
      for (const dir of outputPaths) {
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', path.join(dir, 'Exam Proctor.app')])
      }
    },
  },
  plugins: [
    // Lock the Electron binary down: no ELECTRON_RUN_AS_NODE, NODE_OPTIONS or --inspect,
    // and only the signed-in-asar app code may load.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}
