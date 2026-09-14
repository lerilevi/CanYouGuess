const { withPodfile } = require('expo/config-plugins');

const MARKER = '# CanYouGuess: Xcode 26 / fmt 11.0.2 consteval workaround';

const PODFILE_PATCH = String.raw`
    ${MARKER}
    # React Native 0.79.3 pins fmt 11.0.2. Apple Clang 21 rejects that
    # version's consteval format-string checks. Patch only CocoaPods' generated
    # copy; remove this workaround when React Native upgrades fmt.
    fmt_base = File.join(installer.sandbox.pod_dir('fmt'), 'include', 'fmt', 'base.h')
    unless File.exist?(fmt_base)
      raise "Expected fmt header was not found at #{fmt_base}"
    end

    fmt_contents = File.read(fmt_base)
    enabled_pattern = /^#\s+define FMT_USE_CONSTEVAL 1$/
    disabled_pattern = /^#\s+define FMT_USE_CONSTEVAL 0$/
    enabled_count = fmt_contents.scan(enabled_pattern).length
    disabled_count = fmt_contents.scan(disabled_pattern).length

    if enabled_count == 2
      original_mode = File.stat(fmt_base).mode & 0777
      begin
        File.chmod(0644, fmt_base)
        File.write(fmt_base, fmt_contents.gsub(enabled_pattern, '#  define FMT_USE_CONSTEVAL 0'))
      ensure
        File.chmod(original_mode, fmt_base)
      end
    elsif disabled_count < 2
      raise "Unexpected fmt FMT_USE_CONSTEVAL layout; refusing to apply a partial patch"
    end
`;

function patchPodfile(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }

  const postInstall = /^(\s*post_install do \|installer\|\s*)$/m;
  if (!postInstall.test(contents)) {
    throw new Error('Could not find the iOS Podfile post_install hook for the fmt workaround.');
  }

  return contents.replace(postInstall, `$1${PODFILE_PATCH}`);
}

function withFmtXcode26Fix(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = patchPodfile(podfileConfig.modResults.contents);
    return podfileConfig;
  });
}

module.exports = withFmtXcode26Fix;
module.exports.patchPodfile = patchPodfile;
