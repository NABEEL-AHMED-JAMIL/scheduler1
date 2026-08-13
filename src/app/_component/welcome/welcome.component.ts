import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@/_services';

interface FeatureCard {
    icon: string;
    title: string;
    description: string;

    accent: 'indigo' | 'violet' | 'teal' | 'amber' | 'rose' | 'blue' | 'green';
}

interface StepCard {
    step: number;
    title: string;
    description: string;
}

@Component({
    selector: 'welcome',
    templateUrl: 'welcome.component.html'
})
export class WelcomeComponent implements OnInit {

    public readonly highlights: string[] = ['Kafka-Native', 'AI-Powered', 'Multi-Tenant', 'Role-Based Access'];

    public readonly features: FeatureCard[] = [
        {
            icon: 'glyphicon-briefcase',
            title: 'Source Jobs & Tasks',
            description: 'Schedule, run, and monitor ETL jobs against Kafka-backed task types, with full run history, retry/skip controls, and pipeline tracking.',
            accent: 'indigo'
        },
        {
            icon: 'glyphicon-hdd',
            title: 'Object Browser',
            description: 'Browse, upload, and manage files across your configured storage buckets from one place.',
            accent: 'blue'
        },
        {
            icon: 'glyphicon-picture',
            title: 'PDF Highlighter & Dynamic Forms',
            description: 'Define reusable field selectors for PDFs, and build custom dynamic forms with shareable, API-backed submission links.',
            accent: 'amber'
        },
        {
            icon: 'glyphicon-transfer',
            title: 'Document Converter',
            description: 'Convert Word, Excel, PowerPoint, OpenDocument, and more between formats -- preview PDF/image results inline, and optionally save both the original and converted file to a bucket.',
            accent: 'green'
        },
        {
            icon: 'glyphicon-flash',
            title: 'AI Suite',
            description: 'Configure AI agents, manage local Ollama models, and clean up extracted content -- run any of it against a file from Object Browser.',
            accent: 'violet'
        },
        {
            icon: 'glyphicon-search',
            title: 'Query Engine',
            description: 'Store and run validated, read-only SQL queries against your own database connections, on demand or on a recurring schedule, exported straight to storage.',
            accent: 'teal'
        },
        {
            icon: 'glyphicon-tower',
            title: 'Multi-Tenant Administration',
            description: 'Tenant and user management, role-based access control, and Kafka connection profiles scoped per tenant or shared platform-wide.',
            accent: 'rose'
        }
    ];

    public readonly steps: StepCard[] = [
        { step: 1, title: 'Sign in to your tenant', description: 'Your Platform Admin provisions your organization and account -- sign in with the credentials you were given.' },
        { step: 2, title: 'Configure sources, agents & connections', description: 'A Tenant Admin sets up Source Task Types, AI agents, and Kafka/database connections for the team to use.' },
        { step: 3, title: 'Monitor, run & act', description: 'Everyone else schedules jobs, runs AI agents and queries, and tracks results from the same dashboard.' }
    ];

    public readonly currentYear = new Date().getFullYear();

    constructor(private router: Router, public authService: AuthService) {
    }

    ngOnInit(): void {
        if (this.authService.isLoggedIn()) {
            this.router.navigate(['/home']);
        }
    }

    public goToLogin(): void {
        this.router.navigate(['/login']);
    }

    public scrollToFeatures(): void {
        document.getElementById('landing-features')?.scrollIntoView({ behavior: 'smooth' });
    }

}
