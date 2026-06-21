import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: API_URL, timeout: 10000 });

const STATUS_OPTIONS = ['Planejamento', 'Em andamento', 'Concluído', 'Pausado'];
const CATEGORY_OPTIONS = [
  'Educação',
  'Saúde',
  'Alimentação',
  'Capacitação',
  'Moradia',
  'Cultura e lazer',
  'Meio ambiente',
  'Outros',
];

const EMPTY_FORM = {
  name: '',
  description: '',
  responsible: '',
  status: 'Planejamento',
  startDate: '',
  objectives: '',
  category: 'Educação',
  community: '',
  beneficiaries: 0,
};

function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function formatDate(value) {
  if (!value) return 'Não informada';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function statusClass(status) {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function getApiError(error) {
  const fields = error.response?.data?.fields;
  if (fields) return Object.values(fields).join(' ');
  return error.response?.data?.error || 'Não foi possível concluir a operação.';
}

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    category: '',
    sort: 'createdAt',
    order: 'desc',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/projects', { params: filters });
      setProjects(response.data);
    } catch (requestError) {
      setError(
        'Não foi possível acessar o backend. Verifique se o Docker Compose está em execução.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadProjects, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.status, filters.category, filters.sort, filters.order]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const stats = useMemo(() => {
    const active = projects.filter((project) => project.status === 'Em andamento').length;
    const finished = projects.filter((project) => project.status === 'Concluído').length;
    const beneficiaries = projects.reduce(
      (total, project) => total + Number(project.beneficiaries || 0),
      0
    );
    return { total: projects.length, active, finished, beneficiaries };
  }, [projects]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ q: '', status: '', category: '', sort: 'createdAt', order: 'desc' });
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingProjectId(null);
  };

  const fillExample = () => {
    setFormData({
      name: 'Biblioteca Comunitária Leitura para Todos',
      description:
        'Criação de um espaço de leitura, empréstimo de livros e rodas literárias para moradores.',
      responsible: 'Juliana Ferreira',
      status: 'Planejamento',
      startDate: '2026-08-10',
      objectives:
        'Ampliar o acesso à leitura e apoiar o desenvolvimento educacional de crianças e jovens.',
      category: 'Educação',
      community: 'Comunidade do Sol',
      beneficiaries: 120,
    });
    setEditingProjectId(null);
    setNotice('Exemplo alinhado ao tema preenchido. Revise e clique em Cadastrar projeto.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...formData,
      beneficiaries: Number(formData.beneficiaries || 0),
    };

    try {
      let savedProject;
      if (editingProjectId) {
        const response = await api.put(`/projects/${editingProjectId}`, payload);
        savedProject = response.data;
        setNotice('Projeto atualizado com sucesso.');
      } else {
        const response = await api.post('/projects', payload);
        savedProject = response.data;
        setNotice('Projeto social cadastrado com sucesso.');
      }

      resetForm();
      await loadProjects();
      setSelectedProject(savedProject);
      scrollToSection('projectList');
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (projectId) => {
    setError('');
    try {
      const response = await api.get(`/projects/${projectId}`);
      setSelectedProject(response.data);
      window.setTimeout(() => scrollToSection('projectDetails'), 0);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const startEditing = (project) => {
    setEditingProjectId(project._id);
    setFormData({
      name: project.name || '',
      description: project.description || '',
      responsible: project.responsible || '',
      status: project.status || 'Planejamento',
      startDate: project.startDate || '',
      objectives: project.objectives || '',
      category: project.category || 'Outros',
      community: project.community || '',
      beneficiaries: Number(project.beneficiaries || 0),
    });
    scrollToSection('addProject');
  };

  const deleteProject = async (project) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir o projeto “${project.name}”?`
    );
    if (!confirmed) return;

    setError('');
    try {
      await api.delete(`/projects/${project._id}`);
      if (selectedProject?._id === project._id) setSelectedProject(null);
      if (editingProjectId === project._id) resetForm();
      setNotice('Projeto excluído com sucesso.');
      await loadProjects();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Ir para o início">
          <span className="brand-mark">RI</span>
          <span>
            <strong>Rede de Impacto</strong>
            <small>Projetos sociais</small>
          </span>
        </a>
        <nav aria-label="Navegação principal">
          <button type="button" onClick={() => scrollToSection('home')}>Home</button>
          <button type="button" onClick={() => scrollToSection('projectList')}>Projetos</button>
          <button type="button" onClick={() => scrollToSection('addProject')}>Cadastro</button>
        </nav>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-copy">
            <span className="eyebrow">Gestão comunitária com transparência</span>
            <h1>Projetos sociais que transformam comunidades.</h1>
            <p>
              Cadastre, acompanhe e organize ações de educação, saúde, alimentação,
              capacitação e desenvolvimento local em um único espaço.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={() => scrollToSection('addProject')}>
                Cadastrar projeto
              </button>
              <button className="secondary-button" type="button" onClick={() => scrollToSection('projectList')}>
                Ver projetos
              </button>
            </div>
          </div>
          <div className="hero-card" aria-label="Resumo do propósito da plataforma">
            <span>Nosso propósito</span>
            <strong>Conectar organização, responsáveis e impacto social.</strong>
            <p>Conectando pessoas e causas.</p>
          </div>
        </section>

        <section className="stats-grid" aria-label="Indicadores dos projetos filtrados">
          <article><strong>{stats.total}</strong><span>Projetos exibidos</span></article>
          <article><strong>{stats.active}</strong><span>Em andamento</span></article>
          <article><strong>{stats.finished}</strong><span>Concluídos</span></article>
          <article><strong>{stats.beneficiaries}</strong><span>Beneficiários previstos</span></article>
        </section>

        {notice && <div className="notice success" role="status">{notice}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}

        <section className="content-section" id="projectList">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Lista de projetos da ONG</span>
              <h2>Acompanhe as ações cadastradas</h2>
            </div>
            <span className="exclusive-badge">
              Funcionalidade exclusiva: filtros dinâmicos e ordenação
            </span>
          </div>

          <div className="filter-panel" aria-label="Filtros dinâmicos">
            <label className="field search-field">
              <span>Buscar por palavra-chave</span>
              <input
                name="q"
                value={filters.q}
                onChange={handleFilterChange}
                placeholder="Ex.: educação, Vila Nova, responsável..."
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">Todos</option>
                {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Categoria</span>
              <select name="category" value={filters.category} onChange={handleFilterChange}>
                <option value="">Todas</option>
                {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Ordenar por</span>
              <select name="sort" value={filters.sort} onChange={handleFilterChange}>
                <option value="createdAt">Data de cadastro</option>
                <option value="name">Nome</option>
                <option value="startDate">Data de início</option>
                <option value="beneficiaries">Beneficiários</option>
              </select>
            </label>
            <label className="field">
              <span>Ordem</span>
              <select name="order" value={filters.order} onChange={handleFilterChange}>
                <option value="desc">Decrescente</option>
                <option value="asc">Crescente</option>
              </select>
            </label>
            <button className="clear-button" type="button" onClick={clearFilters}>Limpar filtros</button>
          </div>

          {loading ? (
            <div className="empty-state">Carregando projetos...</div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              Nenhum projeto corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="project-grid">
              {projects.map((project) => (
                <article className="project-card" key={project._id}>
                  <div className="project-card-top">
                    <span className={`status-badge ${statusClass(project.status)}`}>
                      {project.status}
                    </span>
                    <span className="category-label">{project.category}</span>
                  </div>
                  <h3>{project.name}</h3>
                  <p>{project.description}</p>
                  <dl className="project-summary">
                    <div><dt>Comunidade</dt><dd>{project.community}</dd></div>
                    <div><dt>Responsável</dt><dd>{project.responsible}</dd></div>
                    <div><dt>Início</dt><dd>{formatDate(project.startDate)}</dd></div>
                    <div><dt>Beneficiários</dt><dd>{project.beneficiaries || 0}</dd></div>
                  </dl>
                  <div className="card-actions">
                    <button className="primary-button small" type="button" onClick={() => openDetails(project._id)}>
                      Ver detalhes
                    </button>
                    <button className="text-button" type="button" onClick={() => startEditing(project)}>
                      Editar
                    </button>
                    <button className="text-button danger" type="button" onClick={() => deleteProject(project)}>
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="details-section" id="projectDetails">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Área de detalhes</span>
              <h2>Informações completas do projeto</h2>
            </div>
          </div>
          {!selectedProject ? (
            <div className="empty-state">
              Clique em “Ver detalhes” em um projeto para exibir todas as informações.
            </div>
          ) : (
            <article className="details-card">
              <div className="details-title">
                <div>
                  <span className={`status-badge ${statusClass(selectedProject.status)}`}>
                    {selectedProject.status}
                  </span>
                  <h3>{selectedProject.name}</h3>
                  <p>{selectedProject.description}</p>
                </div>
                <span className="category-label large">{selectedProject.category}</span>
              </div>
              <div className="details-grid">
                <div><span>Responsável</span><strong>{selectedProject.responsible}</strong></div>
                <div><span>Comunidade atendida</span><strong>{selectedProject.community}</strong></div>
                <div><span>Data de início</span><strong>{formatDate(selectedProject.startDate)}</strong></div>
                <div><span>Beneficiários previstos</span><strong>{selectedProject.beneficiaries || 0}</strong></div>
                <div className="wide"><span>Objetivos do projeto</span><strong>{selectedProject.objectives}</strong></div>
              </div>
              <div className="card-actions">
                <button className="primary-button small" type="button" onClick={() => startEditing(selectedProject)}>
                  Editar projeto
                </button>
                <button className="text-button danger" type="button" onClick={() => deleteProject(selectedProject)}>
                  Excluir projeto
                </button>
              </div>
            </article>
          )}
        </section>

        <section className="form-section" id="addProject">
          <div className="form-intro">
            <span className="eyebrow">{editingProjectId ? 'Atualização' : 'Cadastro'}</span>
            <h2>{editingProjectId ? 'Editar projeto social' : 'Adicionar novo projeto'}</h2>
            <p>
              Os campos foram adaptados ao tema de gerenciamento de projetos sociais para
              comunidades carentes, conforme definido na Etapa 2.
            </p>
            {!editingProjectId && (
              <button className="secondary-button" type="button" onClick={fillExample}>
                Preencher exemplo temático
              </button>
            )}
          </div>

          <form className="project-form" onSubmit={handleSubmit}>
            <label className="field wide">
              <span>Nome do projeto *</span>
              <input name="name" value={formData.name} onChange={handleInputChange} required />
            </label>
            <label className="field wide">
              <span>Descrição *</span>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3" required />
            </label>
            <label className="field">
              <span>Responsável *</span>
              <input name="responsible" value={formData.responsible} onChange={handleInputChange} required />
            </label>
            <label className="field">
              <span>Status *</span>
              <select name="status" value={formData.status} onChange={handleInputChange} required>
                {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Data de início *</span>
              <input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} required />
            </label>
            <label className="field">
              <span>Categoria *</span>
              <select name="category" value={formData.category} onChange={handleInputChange} required>
                {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Comunidade atendida *</span>
              <input name="community" value={formData.community} onChange={handleInputChange} required />
            </label>
            <label className="field">
              <span>Beneficiários previstos</span>
              <input type="number" min="0" name="beneficiaries" value={formData.beneficiaries} onChange={handleInputChange} />
            </label>
            <label className="field wide">
              <span>Objetivos do projeto *</span>
              <textarea name="objectives" value={formData.objectives} onChange={handleInputChange} rows="4" required />
            </label>
            <div className="form-actions wide">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Salvando...' : editingProjectId ? 'Salvar alterações' : 'Cadastrar projeto'}
              </button>
              {editingProjectId && (
                <button className="secondary-button" type="button" onClick={resetForm}>
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </section>
      </main>

      <footer>
        <strong>Rede de Impacto</strong>
        <span>Projeto de Extensão em Web Back-End — UniCarioca — 2026/1</span>
      </footer>
    </div>
  );
}

export default App;
