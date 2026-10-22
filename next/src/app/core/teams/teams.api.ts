import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../api/api.config';

/** A team's role for one of its people: a LEAD adds and removes members (owner T-Q3); a MEMBER is in it. */
export type TeamRole = 'LEAD' | 'MEMBER';

export interface TeamMember {
  appUserId: number;
  teamRole: TeamRole;
  fullName?: string | null;
  username?: string | null;
  status?: string | null;
}

/** F4 (MIG-401): a team of a workspace, as identity's /appUser.json/teams serves it. */
export interface Team {
  teamId: number;
  tenantId: number;
  name: string;
  description?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt?: string | null;
  memberCount: number;
  leadCount: number;
  members: TeamMember[];
  /** /mine only: the caller's own role in it. */
  myRole?: TeamRole;
}

/**
 * Teams (F4): people of a workspace who work together -- reviewers and assignees of workflow tasks, Approval steps and
 * reviews, alert recipients, Report Studio approvers. A person is in many teams. Every member reads the workspace's teams;
 * an administrator makes, changes and archives them; a team's lead adds and removes its members. Teams grant no pages
 * (owner T-Q2): Page access does that.
 */
@Injectable({ providedIn: 'root' })
export class TeamsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/appUser.json/teams`;

  /** A tenant user lists their own workspace's; a platform administrator names one. */
  list(tenantId?: number | null, withArchived = false): Observable<ApiResponse<Team[]>> {
    const params: Record<string, string | number | boolean> = {};
    if (tenantId) params['tenantId'] = tenantId;
    if (withArchived) params['withArchived'] = true;
    return this.http.get<ApiResponse<Team[]>>(`${this.base}/list`, { params });
  }

  team(teamId: number): Observable<ApiResponse<Team>> {
    return this.http.get<ApiResponse<Team>>(`${this.base}/team`, { params: { teamId } });
  }

  /** The caller's own teams, each with their role in it. */
  mine(): Observable<ApiResponse<Team[]>> {
    return this.http.get<ApiResponse<Team[]>>(`${this.base}/mine`);
  }

  create(name: string, description: string, tenantId?: number | null): Observable<ApiResponse<Team>> {
    return this.http.post<ApiResponse<Team>>(`${this.base}/create`, { name, description, tenantId: tenantId ?? undefined });
  }

  update(teamId: number, name: string, description: string): Observable<ApiResponse<Team>> {
    return this.http.post<ApiResponse<Team>>(`${this.base}/update`, { teamId, name, description });
  }

  archive(teamId: number): Observable<ApiResponse<Team>> {
    return this.http.post<ApiResponse<Team>>(`${this.base}/archive`, { teamId });
  }

  /** Adds a person, or changes their role. */
  addMember(teamId: number, appUserId: number, role: TeamRole = 'MEMBER'): Observable<ApiResponse<Team>> {
    return this.http.post<ApiResponse<Team>>(`${this.base}/members/add`, { teamId, appUserId, role });
  }

  removeMember(teamId: number, appUserId: number): Observable<ApiResponse<Team>> {
    return this.http.post<ApiResponse<Team>>(`${this.base}/members/remove`, { teamId, appUserId });
  }
}

/** A refused call's sentence (identity answers 400/403/404 with {message}), or the fallback. */
export function refusal(e: unknown, fallback: string): string {
  const message = (e as { error?: { message?: string } } | null)?.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
