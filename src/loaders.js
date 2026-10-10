'use strict';

const NATIVE_LOADER = 'NativeLoader1111111111111111111111111111111';
const LOADER_V1 = 'BPFLoader1111111111111111111111111111111111';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const UPGRADEABLE_LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';
const LOADER_V4 = 'LoaderV411111111111111111111111111111111111';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

const NEVER = 'never; this loader has no upgrade mechanism';

/** The loaders that can own an executable account, by address. */
const LOADERS = {
  [NATIVE_LOADER]: {
    kind: 'native',
    name: 'Native loader',
    type: 'built-in program',
    upgrades: 'only by a validator software release, not by any wallet',
  },
  [LOADER_V1]: {
    kind: 'loader-v1',
    name: 'BPF Loader v1 (deprecated)',
    type: 'program',
    upgrades: NEVER,
  },
  [LOADER_V2]: {
    kind: 'loader-v2',
    name: 'BPF Loader v2',
    type: 'program',
    upgrades: NEVER,
  },
  [UPGRADEABLE_LOADER]: {
    kind: 'upgradeable',
    name: 'Upgradeable BPF Loader',
    type: 'program',
    upgrades: 'depends on the upgrade authority',
  },
  [LOADER_V4]: {
    kind: 'loader-v4',
    name: 'Loader v4',
    type: 'program',
    upgrades: 'not read yet; this version does not understand Loader v4 accounts',
  },
};

module.exports = {
  LOADERS,
  LOADER_V1,
  LOADER_V2,
  LOADER_V4,
  NATIVE_LOADER,
  SYSTEM_PROGRAM,
  UPGRADEABLE_LOADER,
};