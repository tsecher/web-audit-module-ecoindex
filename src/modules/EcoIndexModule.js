import {AbstractPuppeteerJourneyModule} from 'web_audit/dist/journey/AbstractPuppeteerJourneyModule.js';
import {PuppeteerJourneyEvents} from 'web_audit/dist/journey/AbstractPuppeteerJourney.js';
import {ModuleEvents} from 'web_audit/dist/modules/ModuleInterface.js';
import {EcoIndexStory} from "ecoindex_puppeteer";
import * as ecoindex from 'ecoindex';

/**
 * EcoIndex Module events.
 */
export const EcoIndexModuleEvents = {
	createEcoIndexModule: 'ecoindex_module__createEcoIndexModule',
	beforeAnalyse: 'ecoindex_module__beforeAnalyse',
	onResult: 'ecoindex_module__onResult',
	onResultDetail: 'ecoindex_module__onResultDetail',
	afterAnalyse: 'ecoindex_module__afterAnalyse',
};

/**
 * EcoIndex.
 */
export default class EcoIndexModule extends AbstractPuppeteerJourneyModule {
	get name() {
		return 'EcoIndex';
	}

	get id() {
		return `ecoindex`;
	}

	contextsData = {};
	story = null;
	hasValue = false;

	/**
	 * {@inheritdoc}
	 */
	async init(context) {
		this.context = context;
		// Install assets coverage store.
		this.context.config.storage?.installStore('ecoindex', this.context, {
			url: 'Url',
			context: 'Context',
			grade: 'Grade',
			ecoIndex: 'Ecoindex',
			domSize: 'Dom Size',
			nbRequest: 'NB request',
			responsesSize: 'Responses Size',
			responsesSizeUncompress: 'Responses Size Uncompress',
			waterConsumption: 'Water consumption',
			greenhouseGasesEmission: 'Greenhouse Gases Emission',
			nbBestPracticesToCorrect: 'Nb Best practices to correct',
		});

		// Emit.
		this.context.eventBus.emit(EcoIndexModuleEvents.createEcoIndexModule, {module: this});
	}

	/**
	 * {@inheritdoc}
	 */
	initEvents(journey) {

		this.story = new EcoIndexStory();

		// Init ecoindex data.
		journey.on(PuppeteerJourneyEvents.JOURNEY_START, async (data) => this.story?.start(data.wrapper.page));
		journey.on(PuppeteerJourneyEvents.JOURNEY_NEW_CONTEXT, async (data) => {
			await this.story?.addStep(data.step);
			const steps = this.story.getSteps();
			this.contextsData[data.name] = steps[steps.length - 1];
		});
		journey.on(PuppeteerJourneyEvents.JOURNEY_END, async () => {
			this.hasValue = true;
			this.story?.stop(PuppeteerJourneyEvents.JOURNEY_END, false);
		});
		journey.on(PuppeteerJourneyEvents.JOURNEY_ERROR, async () => {
			this.hasValue = false;
			this.story?.stop(PuppeteerJourneyEvents.JOURNEY_ERROR, false);
		});
	}

	/**
	 * {@inheritdoc}
	 */
	async analyse(urlWrapper) {
		this.context?.eventBus.emit(ModuleEvents.startsComputing, {module: this});
		for (const contextName in this.contextsData) {
			if (contextName) {
				this.analyseContext(contextName, urlWrapper);
			}
		}
		this.context?.eventBus.emit(ModuleEvents.endsComputing, {module: this});
		return true;
	}


	/**
	 * Analyse a context.
	 *
	 * @param {string} contextName
	 * @param {UrlWrapper} urlWrapper
	 */
	analyseContext(contextName, urlWrapper) {
		const contextData = this.contextsData[contextName];
		const eventData = {
			module: this,
			url: urlWrapper,
		};
		this.context?.eventBus.emit(EcoIndexModuleEvents.beforeAnalyse, eventData);
		this.context?.eventBus.emit(ModuleEvents.beforeAnalyse, eventData);

		// Summary.
		eventData.result = {
			...{
				url: urlWrapper.url.toString(),
				context: contextName,
			},
			...this.getCleanResults(contextData)
		};
		this.context?.eventBus.emit(EcoIndexModuleEvents.onResult, eventData);
		this.context?.config?.logger.result(`EcoIndex`, eventData.result, urlWrapper.url.toString());
		this.context?.config?.storage?.add('ecoindex', this.context, eventData.result);
		this.context?.eventBus.emit(ModuleEvents.afterAnalyse, eventData);
		this.context?.eventBus.emit(EcoIndexModuleEvents.afterAnalyse, eventData);
	}

	/**
	 * Return clean results.
	 *
	 * @param {UrlWrapper} urlWrapper
	 * @returns {any[]}
	 * @private
	 */
	getCleanResults(step) {
		const metrics = step.getMetrics();
		const ecoindexValue = ecoindex.computeEcoIndex(
			metrics?.getDomElementsCount(),
			metrics?.getRequestsCount(),
			metrics?.getSize() || 0,
		);

		return {
			grade: ecoindex.getEcoIndexGrade(ecoindexValue),
			ecoIndex: ecoindexValue,
			domSize: metrics?.getDomElementsCount(),
			nbRequest: metrics?.getRequestsCount(),
			responsesSize: metrics?.getSize(),
			greenhouseGasesEmission: ecoindex.computeGreenhouseGasesEmissionfromEcoIndex(ecoindexValue),
			waterConsumption: ecoindex.computeWaterConsumptionfromEcoIndex(ecoindexValue),
		};
	}

}
