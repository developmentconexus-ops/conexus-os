import picomatch from 'picomatch';

const tests = [
  ['*infra/pilot/*', 'setsid nohup infra/pilot/runner.sh'],
  ['*hub.env*', 'echo "foo" >> ~/wt-rmmc/.audit/slice7/hub.env'],
  ['*docker *conexus-*', 'docker stop conexus-apps-postgres'],
  ['*docker *conexus-*', 'docker rm conexus-apps-postgres'],
  ['*kill *', 'kill -TERM 1234'],
];

for (const [pattern, str] of tests) {
  const isMatch = picomatch(pattern);
  console.log(`pattern: ${pattern}, str: ${str}, match: ${isMatch(str)}`);
}