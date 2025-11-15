const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m'
};

function formatColor(message, color = 'reset') {
	const colorCode = colors[color] || colors.reset;
	return `${colorCode}${message}${colors.reset}`;
}

export function log(message, color = 'reset') {
	console.log(formatColor(message, color));
}

export function logDivider(char = '=', length = 50, color = 'cyan') {
	log(char.repeat(length), color);
}

export function logStep(step, description) {
	log(`\n🔧 Step ${step}: ${description}`, 'cyan');
}

export function logSuccess(message) {
	log(`✅ ${message}`, 'green');
}

export function logError(message) {
	log(`❌ ${message}`, 'red');
}

export function logWarning(message) {
	log(`⚠️  ${message}`, 'yellow');
}

export function logInfo(message) {
	log(`ℹ️  ${message}`, 'blue');
}

export function logHeader(message) {
	log(message, 'bright');
}

export function logJson(label, data) {
	log(label, 'bright');
	console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}
