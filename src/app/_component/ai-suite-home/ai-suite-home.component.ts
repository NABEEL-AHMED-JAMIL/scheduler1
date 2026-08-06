import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface AiSuiteTool {
    title: string;
    description: string;
    icon: string;
    route: string;
}

/**
 * Card-grid landing page for every AI Suite tool -- the dropdown nav stays as a quick-access
 * shortcut, this is the "browse what's available" entry point, one card per tool with an
 * icon/description/Open action instead of a dense list.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'ai-suite-home',
    templateUrl: 'ai-suite-home.component.html'
})
export class AiSuiteHomeComponent {

    public tools: AiSuiteTool[] = [
        {
            title: 'AI Agents',
            description: 'Configure saved LLM providers, models, and prompts -- every AI tool below runs through an agent you set up here.',
            icon: 'glyphicon-flash',
            route: '/aiAgent'
        },
        {
            title: 'Ollama Models',
            description: 'See which local Ollama models are pulled and ready to use by your agents.',
            icon: 'glyphicon-hdd',
            route: '/ollamaModels'
        },
        {
            title: 'Content Cleaner',
            description: 'Tidy up stray whitespace, smart quotes, and copy-paste artifacts from any block of text.',
            icon: 'glyphicon-magnet',
            route: '/contentCleaner'
        },
        {
            title: 'Audio Transcript Extractor',
            description: 'Transcribe an uploaded audio file, video, or YouTube link, then ask AI questions about it.',
            icon: 'glyphicon-headphones',
            route: '/audioTranscriptExtractor'
        },
        {
            title: 'Image Text Extractor',
            description: 'OCR text out of an image -- mark just the region you need, or extract the whole image.',
            icon: 'glyphicon-camera',
            route: '/imageTextExtractor'
        },
        {
            title: 'AI Assistant',
            description: 'A general-purpose chat -- paste content, ask questions, and iterate turn by turn.',
            icon: 'glyphicon-comment',
            route: '/aiChat'
        },
        {
            title: 'CV Tailor',
            description: 'Tailor a PDF resume to a job description as a clean, downloadable Markdown resume.',
            icon: 'glyphicon-briefcase',
            route: '/cvTailor'
        }
    ];

    constructor(private router: Router) {
    }

    public open(tool: AiSuiteTool): void {
        this.router.navigate([tool.route]);
    }

}
