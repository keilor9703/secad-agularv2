import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NoticiaService, DtoNoticia } from '../../../../core/services/noticia.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-noticias-web',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './noticias-page.component.html',
  styleUrl: './noticias-page.component.scss'
})
export class NoticiasPageComponent implements OnInit {
  minimized = false;
  closed = false;
  isLoading = true;
  hasError = false;
  errorMessage = '';

  currentPage = 1;
  itemsPerPage = 8;
  totalPages = 0;

  news: DtoNoticia[] = [];

  modalOpen = false;
  selectedNoticia: DtoNoticia | null = null;
  liked = false;

  constructor(private noticiaService: NoticiaService) {}

  ngOnInit(): void {
    this.loadNoticias();
  }

  loadNoticias(): void {
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';

    this.noticiaService.getActivas().subscribe({
      next: (news) => {
        this.news = news.sort((a, b) => 
          new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
        );
        this.currentPage = 1;
        this.calculateTotalPages();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.hasError = true;
        this.errorMessage = 'No fue posible cargar las noticias. Intente nuevamente.';
      }
    });
  }

  calculateTotalPages(): void {
    this.totalPages = Math.ceil(this.news.length / this.itemsPerPage);
  }

  get paginatedNews(): DtoNoticia[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.news.slice(startIndex, endIndex);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.scrollToTop();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.scrollToTop();
    }
  }

  getImageUrl(noticia: DtoNoticia): string {
    const raw = (noticia.imagenNoticia ?? '').trim();
    if (!raw) return '/imagenes/actividades/news2.jpg';
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
    
    const baseUrl = environment.sliderMediaBaseUrl || 'https://srvdockergusof.policia.gov.co:8088';
    
    // Si la imagen viene como /api/... o simplemente el nombre, apuntamos al servidor externo
    if (raw.startsWith('/api/')) {
      return `${baseUrl}${raw}`;
    }

    const fileName = raw.split('/').filter(Boolean).pop() ?? '';
    return `${baseUrl}/api/NoticiaUpload/Imagen/${encodeURIComponent(fileName)}`;
  }

  getNoticiaUrl(noticia: DtoNoticia): string {
    return `/administracion/noticias`;
  }

  openNoticia(noticia: DtoNoticia): void {
    this.selectedNoticia = noticia;
    this.modalOpen = true;
    document.body.classList.add('modal-open');
  }

  closeNoticia(): void {
    this.modalOpen = false;
    this.selectedNoticia = null;
    document.body.classList.remove('modal-open');
  }

  likeNoticia(noticia: DtoNoticia, event: Event): void {
    event.stopPropagation();
    
    const likedNews = this.getLikedNews();
    if (likedNews.includes(noticia.idNoticia)) {
      return;
    }
    
    this.liked = true;
    this.noticiaService.darLike(noticia.idNoticia).subscribe({
      next: () => {
        noticia.megusta = (noticia.megusta || 0) + 1;
        this.saveLikedNews(noticia.idNoticia);
        setTimeout(() => this.liked = false, 1000);
      },
      error: (err) => {
        console.error('Error dando like:', err);
        this.liked = false;
      }
    });
  }

  hasLiked(noticiaId: number): boolean {
    return this.getLikedNews().includes(noticiaId);
  }

  private getLikedNews(): number[] {
    const stored = sessionStorage.getItem('likedNews');
    return stored ? JSON.parse(stored) : [];
  }

  private saveLikedNews(noticiaId: number): void {
    const liked = this.getLikedNews();
    if (!liked.includes(noticiaId)) {
      liked.push(noticiaId);
      sessionStorage.setItem('likedNews', JSON.stringify(liked));
    }
  }

  private scrollToTop(): void {
    const element = document.querySelector('.news-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
