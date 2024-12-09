import { LinkedinJobApplicator } from "./controllers/linkedin.ts";

(async () => {
	try {
		const applicator = new LinkedinJobApplicator();

		await applicator.initialize();
		await applicator.start();
		console.log('end of life');
	} catch (err) {
		console.log(err);
	}
})();
