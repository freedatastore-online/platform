export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

export function runChecks(toolDir: string): CheckResult[] {
  // Placeholder — will check: package.json exists, MIT license, SDK dependency, etc.
  return [
    { name: 'has-package-json', passed: true, message: 'package.json found' },
    { name: 'has-license', passed: true, message: 'MIT license found' },
    { name: 'uses-sdk', passed: true, message: '@freedatastore/sdk in dependencies' },
  ];
}
